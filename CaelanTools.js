var CTModule = CTModule || {
    version: 0.4,
    debug_mode: true,
    valid_commands: ["CraftingRoller","SuccessCounter"],
    craft_check_result_table: {
        "0.00": 5,
        "0.20": 6,
        "0.40": 7,
        "0.60": 8,
        "0.80": 9,
        "1.00": 20,
        "1.05": 23,
        "1.10": 26,
        "1.15": 29,
        "1.20": 32,
        "1.25": 35,
        "1.30": 100,
    },

    CraftingRoller: function(args){
        if (CTModule.debug_mode) {log("CraftingRoller called.");}
        if (CTModule.IsObjectEmpty(args)) {
            // Display help message
            // Need to use the special html char codes. &lt; is < and &gt; is >
            // https://dev.w3.org/html5/html-author/charref
            sendChat('CTModule', "Usage: !ct -cmd CraftingRoller -craft_price &lt;float&gt; "
                    + "-roll_limit &lt;int&gt; -gold_limit &lt;float&gt; [optional: -dice_roll "
                    + "&lt;string&gt; -gold_per_roll &lt;float&gt;]");
        }

        let craft_price, roll_limit, gold_limit, dice_roll, gold_per_roll;
        // Check for mandatory arguments
        if (!args.hasOwnProperty("craft_price")) {log("Missing craft_price arg."); return;}
        if (!args.hasOwnProperty("roll_limit")) {log("Missing roll_limit arg."); return;}
        if (!args.hasOwnProperty("gold_limit")) {log("Missing gold_limit arg."); return;}

        // Parse parameters and check typing
        craft_price = parseFloat(args["craft_price"]);
        if (isNaN(craft_price)) {log("craft_price is not a number."); return;}
        roll_limit = parseInt(args["roll_limit"]);
        if (isNaN(roll_limit)) {log("roll_limit is not a number."); return;}
        gold_limit = parseFloat(args["gold_limit"]);
        if (isNaN(gold_limit)) {log("gold_limit is not a number."); return;}
        dice_roll = args.hasOwnProperty("dice_roll") ?
                        args["dice_roll"] : "1d20";
        gold_per_roll = args.hasOwnProperty("gold_per_roll") ?
                        parseFloat(args["gold_per_roll"]) : 40;
        if (isNaN(gold_per_roll)) {log("gold_per_roll is not a number."); return;}

        if (CTModule.debug_mode) {log([craft_price, roll_limit, gold_limit, dice_roll, gold_per_roll]);}

        // Prepare a message with all of the inline rolls needed to do the
        // crafting logic
        let inline_roll_piece = "[[" + dice_roll + "]]";
        if (CTModule.debug_mode) {log(inline_roll_piece);}
        let roll_message = "";
        for (let i = 0; i < roll_limit; i++) {
            roll_message += inline_roll_piece;
        }
        if (CTModule.debug_mode) {log(roll_message);}

        // Since there is no way to get the roll values from the message we
        // send back to *this* function, any future logic we want done has to
        // be inside of the callback function.
        sendChat('CTModule', roll_message, function (ops) {
            // While in this callback function, we also have access to the
            // variables of the function that called sendChat.
            let total_gold_progress = 0.00;
            let rolls_made = 0;
            let gold_spent = 0.00;

            // Supposedly ops is an array of operations returned by sendChat, but
            // I have no idea when it would ever contain more than 1 item.
            while (total_gold_progress < craft_price && rolls_made < roll_limit
                    && gold_spent < gold_limit) {

                let gold_this_roll = gold_limit - gold_spent > gold_per_roll
                                    ? gold_per_roll : gold_limit - gold_spent;
                let roll_total = ops[0].inlinerolls[rolls_made].results.total;
                rolls_made += 1;

                // Get the gold modifier of the crafting roll
                let craft_gold_mod = null;
                for (let roll_bracket in CTModule.craft_check_result_table) {
                    if (roll_total <= CTModule.craft_check_result_table[roll_bracket]) {
                        craft_gold_mod = parseFloat(roll_bracket);
                        break;
                    }
                }
                if (craft_gold_mod == null) {
                    log("Invalid dice roll result.");
                    return;
                }

                // Figure out how much progress was made
                total_gold_progress += gold_this_roll * craft_gold_mod;
                // If the gold progress made is over the needed craft price,
                // refund the gold that isn't actually needed
                if (total_gold_progress > craft_price) {
                    gold_this_roll -= (total_gold_progress - craft_price)/craft_gold_mod;
                    // Round to the nearest copper coin
                    gold_this_roll = Math.ceil(100 * gold_this_roll) / 100;
                    total_gold_progress = craft_price;
                }
                gold_spent += gold_this_roll;
            }

            // At this point, we've either finished crafting or run out of
            // either rolls or gold
            let end_state_message;
            if (total_gold_progress < craft_price) {
                // Didn't finish crafting
                if (rolls_made == roll_limit) {
                    end_state_message = "Ran out of rolls.";
                } else {
                    end_state_message = "Ran out of gold.";
                }
            } else {
                end_state_message = "Crafting completed.";
            }
            sendChat('CTModule', end_state_message + "\nProgress: " + total_gold_progress
                        + " / " + craft_price + "\nRolls: " + rolls_made + " / " +
                        roll_limit + "\nGold used: " + gold_spent + " / " + gold_limit);

        }, {noarchive: false});

    },

    SuccessCounter: function(args){
        if (CTModule.debug_mode) {log("SuccessCounter called.");}
        if (CTModule.IsObjectEmpty(args)) {
            // Display help message
            sendChat('CTModule', "Usage: !ct -cmd SuccessCounter -num_rolls &lt;int&gt; "
					+ "-dice_roll &lt;string&gt; -target_value &lt;int&gt; [optional: "
					+ "-crit_success_range &lt;int&gt; -crit_fail_range &lt;int&gt; "
					+ "-roll_over_target &lt;bool&gt; -display_successes &lt;bool&gt; "
					+ "-damage_roll &lt;string&gt; -crit_damage_roll &lt;string&gt; "
					+ "-black_crusade_degrees &lt;bool&gt; -bc_unnatural &lt;int&gt; "
					+ "-bc_firing_mode &lt;string&gt; [optional: &lt;int&gt;]]");
        }

        let dice_roll, num_rolls, target_value, crit_success_range,
            crit_fail_range, black_crusade_degrees, roll_under_or_over,
            bc_unnatural, bc_firing_mode, display_successes, damage_roll,
			crit_damage_roll;

        if (!args.hasOwnProperty("dice_roll")) {log("Missing dice_roll arg."); return;}
        if (!args.hasOwnProperty("num_rolls")) {log("Missing num_rolls arg."); return;}
        if (!args.hasOwnProperty("target_value")) {log("Missing target_value arg."); return;}

        dice_roll = args["dice_roll"];
        num_rolls = parseInt(args["num_rolls"]);
        if (isNaN(num_rolls)) {log("num_rolls is not a number."); return;}
        target_value = parseInt(args["target_value"]);
        if (isNaN(target_value)) {log("target_value is not a number."); return;}
        crit_success_range = args.hasOwnProperty("crit_success_range") ?
                            parseInt(args["crit_success_range"]) : 0;
        if (isNaN(crit_success_range)) {log("crit_success_range is not a number."); return;}
        crit_fail_range = args.hasOwnProperty("crit_fail_range") ?
                            parseInt(args["crit_fail_range"]) : 0;
        if (isNaN(crit_fail_range)) {log("crit_fail_range is not a number."); return;}
        roll_over_target = args.hasOwnProperty("roll_over_target") ?
                            args["roll_over_target"] == "true" : true;
							
		// Display successes will log a message in the chat with the values of
		// the rolls that passed. If damage rolls are provided, those will also
		// be rolled for any successes.
		display_successes = args.hasOwnProperty("display_successes") ?
                            args["display_successes"] == "true" : false;
		damage_roll = args.hasOwnProperty("damage_roll") && display_successes ?
                            args["damage_roll"] : "";
		crit_damage_roll = args.hasOwnProperty("crit_damage_roll") && damage_roll !== "" ?
                            args["crit_damage_roll"] : "";
							
							
		black_crusade_degrees = args.hasOwnProperty("black_crusade_degrees") &&
								roll_over_target == false ?
                                args["black_crusade_degrees"] == "true" : false;
        bc_unnatural = args.hasOwnProperty("bc_unnatural") ?
                            parseInt(args["bc_unnatural"]) : 0;
        if (isNaN(bc_unnatural)) {log("bc_unnatural is not a number."); return;}
        bc_firing_mode = args.hasOwnProperty("bc_firing_mode") ?
                            args["bc_firing_mode"] : "";

        let bc_attack_limit = 0;
        let firing_mode_space_pos;
        if ((firing_mode_space_pos = bc_firing_mode.indexOf(" ")) != -1) {
            bc_attack_limit = parseInt(bc_firing_mode.substring(firing_mode_space_pos+1));
            if (isNaN(bc_attack_limit)) {log("bc_attack_limit is not a number."); return;}
            bc_firing_mode = bc_firing_mode.substring(0, firing_mode_space_pos);
        }

        // If crit_success_range is 0, don't bother checking for crit successes
        // black_crusade_degrees should print degrees success/failure per roll

        // Prepare a message with all of the inline rolls needed to do the
        // success counting logic
        let inline_roll_piece = "[[" + dice_roll + "]]";
        if (CTModule.debug_mode) {log(inline_roll_piece);}
        let roll_message = "";
        for (let i = 0; i < num_rolls; i++) {
            roll_message += inline_roll_piece;
        }
        if (CTModule.debug_mode) {log(roll_message);}

        // Since there is no way to get the roll values from the message we
        // send back to *this* function, any future logic we want done has to
        // be inside of the callback function.
        sendChat('CTModule', roll_message, function (ops) {
            // While in this callback function, we also have access to the
            // variables of the function that called sendChat.
            let rolls_examined = 0;
            let successes = 0;
            let crit_successes = 0;
            let crit_fails = 0;
            let black_crusade_msg = "\n";
			let display_successes_msg = "\n";

            // Supposedly ops is an array of operations returned by sendChat, but
            // I have no idea when it would ever contain more than 1 item.
            while (rolls_examined < num_rolls) {
                if (CTModule.debug_mode) {log(ops[0].inlinerolls[rolls_examined].results);}
                let roll_total = ops[0].inlinerolls[rolls_examined].results.total;
                let main_die_face = null;
                if (crit_success_range || crit_fail_range) {
                    let dice_rolls = ops[0].inlinerolls[rolls_examined].results.rolls[0].results;
                    for (dice of dice_rolls) {
                        if (dice.hasOwnProperty("d")) {continue;}
                        else if (main_die_face == null) {
                            main_die_face = dice.v;
                        } else {
                            log("Script doesn't support multi-die crits yet.");
                            return;
                        }
                    }
                    if (main_die_face == null) {log("Error: main die face couldn't be found."); return;}
                    if (CTModule.debug_mode) {log("Main die face: " + main_die_face);}
                }
                rolls_examined += 1;

                if (roll_over_target) {
					
                    // Crit successes are auto passes
                    if (crit_success_range && main_die_face >= crit_success_range) {
                        crit_successes += 1;
                        successes += 1;
						
						// Handle success display message
						if (display_successes) {
							display_successes_msg += "[[" + roll_total + "d1cs>1cf<0]]";
							
							// If given a critical damage roll, display it
							if (crit_damage_roll !== "") {
								display_successes_msg += "_[[" + crit_damage_roll + "]]";
								
							// If no crit damage roll is present but a normal one is, display it
							} else if (damage_roll !== "") {
								display_successes_msg += "_[[" + damage_roll + "]]";
							}
							
							display_successes_msg += "  ";
						}
						
                    // Crit fails are auto fails
                    } else if (crit_fail_range && main_die_face <= crit_fail_range) {
                        crit_fails += 1;
						
                    // If no crit, check if roll met the target
                    } else if (roll_total >= target_value) {
                        successes += 1;
						
						// Handle success display message
						if (display_successes) {
							display_successes_msg += "[[" + roll_total + "]]";
							
							// If given a damage roll, display it
							if (damage_roll !== "") {
								display_successes_msg += "_[[" + damage_roll + "]]";
							}
							
							display_successes_msg += "  ";
						}
                    }
					
                } else {
					
                    // Crit successes are auto passes
                    if (crit_success_range && main_die_face <= crit_success_range) {
                        crit_successes += 1;
                        successes += 1;

                        // Handle black crusade degrees of success
                        if (black_crusade_degrees) {

                            // If target was met, handle them normally
                            if (roll_total <= target_value) {
                                let attack_offset;
                                switch (bc_firing_mode) {
                                    case "single":
                                        attack_offset = Math.floor((target_value-roll_total)/10)
                                                        + Math.floor(bc_unnatural/2);
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    case "semi":
                                        attack_offset = 1 + Math.floor((target_value-roll_total)/10)
                                                        + Math.floor(bc_unnatural/2);
                                        let semi_temp = Math.floor((attack_offset+1)/2);
                                        semi_temp = bc_attack_limit && semi_temp > bc_attack_limit ?
                                                        bc_attack_limit : semi_temp;
                                        attack_offset -= semi_temp;
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    case "full":
                                        attack_offset = 1 + Math.floor((target_value-roll_total)/10)
                                                        + Math.floor(bc_unnatural/2);
                                        let full_temp = attack_offset;
                                        full_temp = bc_attack_limit && full_temp > bc_attack_limit ?
                                                        bc_attack_limit : full_temp;
                                        attack_offset -= full_temp;
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    default:
                                        black_crusade_msg += "[[1d1 + floor((" + target_value + "-("
                                                        + roll_total + "))/10) + floor(" +
                                                        bc_unnatural + "/2)]] ";
                                }
                                /*black_crusade_msg += "[[1d1 + floor((" + target_value + "-("
                                                    + roll_total + "))/10) + floor(" +
                                                    bc_unnatural + "/2)]] ";*/

                            // If target wasn't met, add an offset to ensure that
                            // the degrees of success is always exactly 1
                            } else {
                                let offset = Math.floor((target_value - roll_total)/10);
                                let attack_offset;
                                switch (bc_firing_mode) {
                                    case "single":
                                        attack_offset = Math.floor(bc_unnatural/2);
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) - ("
                                                        + offset + ") + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    case "semi":
                                        attack_offset = 1 + Math.floor(bc_unnatural/2);
                                        let semi_temp = Math.floor((attack_offset+1)/2);
                                        semi_temp = bc_attack_limit && semi_temp > bc_attack_limit ?
                                                        bc_attack_limit : semi_temp;
                                        attack_offset -= semi_temp;
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) - ("
                                                        + offset + ") + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    case "full":
                                        attack_offset = 1 + Math.floor(bc_unnatural/2);
                                        let full_temp = attack_offset;
                                        full_temp = bc_attack_limit && full_temp > bc_attack_limit ?
                                                        bc_attack_limit : full_temp;
                                        attack_offset -= full_temp;
                                        black_crusade_msg += "[[1d1 + floor((" + target_value
                                                        + "-(" + roll_total + "))/10) - ("
                                                        + offset + ") + floor("
                                                        + bc_unnatural + "/2) - "
                                                        + attack_offset + "]] ";
                                        break;
                                    default:
                                        black_crusade_msg += "[[1d1 + floor((" + target_value + "-("
                                                        + roll_total + "))/10) - ("
                                                        + offset + ") + floor(" +
                                                        bc_unnatural + "/2)]] ";
                                }
                            }
                        }

                    // Crit fails are auto fails
                    } else if (crit_fail_range && main_die_face >= crit_fail_range) {
                        crit_fails += 1;

                        // Handle black crusade degrees of failure
                        if (black_crusade_degrees) {
                            // If target wasn't met, handle them normally
                            if (roll_total > target_value) {
                                black_crusade_msg += "[[floor((" + target_value + "-("
                                                    + roll_total + "))/10)]] ";
                            // If target wasn't met, subtract an offset to ensure that
                            // the degrees of failure is always exactly 1
                            } else {
                                let offset = -1 - Math.floor((target_value - roll_total)/10);
                                black_crusade_msg += "[[floor((" + target_value + "-("
                                                    + roll_total + "))/10) + "
                                                    + offset + "]] ";
                            }
                        }

                    // If no crit, check if roll met the target
                    } else if (roll_total <= target_value) {
                        successes += 1;

                        // Handle black crusade degrees of success
                        if (black_crusade_degrees) {

                            let attack_offset;
                            switch (bc_firing_mode) {
                                case "single":
                                    attack_offset = Math.floor((target_value-roll_total)/10)
                                                    + Math.floor(bc_unnatural/2);
                                    black_crusade_msg += "[[1d1 + floor((" + target_value
                                                    + "-(" + roll_total + "))/10) + floor("
                                                    + bc_unnatural + "/2) - "
                                                    + attack_offset + "]] ";
                                    break;
                                case "semi":
                                    attack_offset = 1 + Math.floor((target_value-roll_total)/10)
                                                    + Math.floor(bc_unnatural/2);
                                    let semi_temp = Math.floor((attack_offset+1)/2);
                                    semi_temp = bc_attack_limit && semi_temp > bc_attack_limit ?
                                                    bc_attack_limit : semi_temp;
                                    attack_offset -= semi_temp;
                                    black_crusade_msg += "[[1d1 + floor((" + target_value
                                                    + "-(" + roll_total + "))/10) + floor("
                                                    + bc_unnatural + "/2) - "
                                                    + attack_offset + "]] ";
                                    break;
                                case "full":
                                    attack_offset = 1 + Math.floor((target_value-roll_total)/10)
                                                    + Math.floor(bc_unnatural/2);
                                    let full_temp = attack_offset;
                                    full_temp = bc_attack_limit && full_temp > bc_attack_limit ?
                                                    bc_attack_limit : full_temp;
                                    attack_offset -= full_temp;
                                    black_crusade_msg += "[[1d1 + floor((" + target_value
                                                    + "-(" + roll_total + "))/10) + floor("
                                                    + bc_unnatural + "/2) - "
                                                    + attack_offset + "]] ";
                                    break;
                                default:
                                    black_crusade_msg += "[[1d1 + floor((" + target_value + "-("
                                                    + roll_total + "))/10) + floor(" +
                                                    bc_unnatural + "/2)]] ";
                            }
                            /*black_crusade_msg += "[[1d1 + floor((" + target_value + "-("
                                                + roll_total + "))/10) + floor(" +
                                                bc_unnatural + "/2)]] ";*/
                        }

					} else {

                        // Handle black crusade degrees of failure
                        if (black_crusade_degrees) {
                            black_crusade_msg += "[[floor((" + target_value + "-("
                                               + roll_total + "))/10)]] ";
                        }
                    }
                }
            }

            display_msg = "Successes: " + successes;

            if (crit_success_range) {
                display_msg += "\nCritical successes: " + crit_successes;
            }
            if (crit_fail_range) {
                display_msg += "\nCritical failures: " + crit_fails;
            }
            if (black_crusade_degrees) {
                display_msg += black_crusade_msg;
            }
			if (display_successes) {
				display_msg += display_successes_msg;
			}

			if (CTModule.debug_mode) {log(display_msg);}
			
            sendChat('CTModule', display_msg);

        }, {noarchive: false});

    },

    HandleMessage: function(msg){
		let command_keyword_match = msg.content.match(/^[!]ct\b/);
        if(msg.type === "api" && command_keyword_match) {
			
            // Parse message content for individual args
            let parsed_args = CTModule.CTparse(msg.content);
            if (parsed_args == null) {return;}

            if (parsed_args.hasOwnProperty("cmd") == false) {
				log("No command argument.");
				
            } else {
                let command = parsed_args["cmd"];				
                if (CTModule.debug_mode) {log(command);}
				
                if (CTModule.valid_commands.includes(command)) {
                    delete parsed_args["cmd"];
                    CTModule[command](parsed_args);
					
                } else {
					log("Command not legal or doesn't exist.");
				}
            }
        }
    },

    RegisterEventHandlers: function(){
        on('chat:message',CTModule.HandleMessage);
    },

    IsObjectEmpty: function(object){
        for(var key in object) {
            if (object.hasOwnProperty(key)) {
                return false;
            }
        }
        return true;
    },

    CTparse: function(str){
        arg_dict = {};
        const word_list = str.split('-');

        let api_key_pattern = /^[!]ct\s+$/;
        if (api_key_pattern.test(word_list[0]) == false) {
            log("Non-parameter characters following api key.");
            return null;
        }

        // Find the positions of all the flags in the message
        let flag_pattern = /\s[-]\w+\s+/g; //" -abc  "
        let match_idxs = [];
        while ((match = flag_pattern.exec(str)) != null) {
            match_idxs.push(match.index+2);
        }
        if (CTModule.debug_mode) {log(match_idxs);}

        // For each flag and argument substring, separate both
        // the flag and its associated argument and save them
        for (let i = 0; i < match_idxs.length; i++) {

            let substr = (i < match_idxs.length-1)
                        ? str.substring(match_idxs[i], match_idxs[i+1]-2)
                        : str.substring(match_idxs[i]);
            const flag_end = substr.indexOf(' ');

            // If no space follows the flag, there is no argument, do nothing
            if (flag_end == -1) {continue;}

            const flag = substr.substring(0, flag_end);
            const arg = substr.substring(flag_end+1).trim();

            // If flag or arg are empty, don't put in list
            if (flag == "" || arg == "") {continue;}

            // If flag already in dict, log error
            if (arg_dict.hasOwnProperty(flag)) {
                log("Repeated flags: " + flag);
                return null;
            }

            arg_dict[flag] = arg;
        }

        if (CTModule.IsObjectEmpty(arg_dict)) {arg_dict = null;}
        if (CTModule.debug_mode) {log(arg_dict);}
        return arg_dict;
    },

};

on('ready', function(){
    CTModule.RegisterEventHandlers();
});
