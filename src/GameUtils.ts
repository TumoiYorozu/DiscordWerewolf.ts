import * as Discord from "discord.js";
import * as fs from "fs"
import {validate, JsonRuntimeType} from 'ts-json-validator';
import {RuleTypeFormat, RuleType} from "./JsonType";
var JSON5 = require('json5');

export class GameChannels {
    Werewolf    : Discord.TextChannel;
    GameLog     : Discord.TextChannel;
    DebugLog    : Discord.TextChannel;
    Living      : Discord.TextChannel;
    LivingVoice : Discord.VoiceChannel;
    Dead        : Discord.TextChannel;
    DeadVoice   : Discord.VoiceChannel;
    constructor(
        aWerewolf    : Discord.TextChannel,
        aGameLog     : Discord.TextChannel,
        aDebugLog    : Discord.TextChannel,
        aLiving      : Discord.TextChannel,
        aLivingVoice : Discord.VoiceChannel,
        aDead        : Discord.TextChannel,
        aDeadVoice   : Discord.VoiceChannel
    ) {
        this.Werewolf     = aWerewolf;
        this.GameLog      = aGameLog;
        this.DebugLog     = aDebugLog;
        this.Living       = aLiving;
        this.LivingVoice  = aLivingVoice;
        this.Dead         = aDead;
        this.DeadVoice    = aDeadVoice;
    }
}

export function format(msg: string, obj: any): string {
    return msg.replace(/\{(\w+)\}/g, (m, k) => {  // m="{id}", k="id"
        return obj[k];
    });
}

export function isThisCommand(content : string, list:string[]){
    return list.findIndex(cmd => content.startsWith(cmd));
}

export function assertUnreachable(x: never): never {
    throw new Error("Didn't expect to get here");
}

export function shuffle<T>(array: T[]) {
    const out = Array.from(array);
    for (let i = out.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[r];
        out[r] = tmp;
    }
    return out;
}


export function loadAndSetSysRuleSet(path : string, RuleSet ?: RuleType){
    const data = fs.readFileSync(path, 'utf-8');
    const json5 = JSON5.parse(data);
    try {
        const ret = validate(RuleTypeFormat, json5);
        if(ret != null) RuleSet = ret;
        return ret;
    } catch (e) {
        console.log(e);
    }
}

export function make_button(id : string, label : string, opt : {
    emoji? : string,
    style? : Discord.MessageButtonStyle | "blue" | "green" | "black" | "red",
}) {
    const res = new Discord.MessageButton().setCustomId(id).setLabel(label);
    if (opt.emoji) res.setEmoji(opt.emoji);
    if (opt.style) {
        if (opt.style == "PRIMARY"   || opt.style == "blue")  res.setStyle("PRIMARY");
        if (opt.style == "SUCCESS"   || opt.style == "green") res.setStyle("SUCCESS");
        if (opt.style == "SECONDARY" || opt.style == "black") res.setStyle("SECONDARY");
        if (opt.style == "DANGER"    || opt.style == "red")   res.setStyle("DANGER");
        if (opt.style == "LINK") res.setStyle("LINK");
    }
    return res;
}

export function arrange_buttons(buttons : Discord.MessageButton[]) {
    const rows = Math.ceil(buttons.length / 5);
    const components : Discord.MessageActionRow[] = [];
    for (let i = 0; i < rows; ++i) {
        components[i] = new Discord.MessageActionRow();
    }
    for (let i = 0; i < buttons.length; ++i) {
        components[i % rows].addComponents(buttons[i]);
    }
    return components;
}
export function arrange_components(c : Discord.MessageActionRow[]) {
    const res : Discord.MessageActionRow[][] = [];
    for (let i = 0; i < c.length; ++i) {
        const j = Math.floor(i / 5);
        if (i % 5 == 0) res[j] = [];
        res[j].push(c[i]);
    }
    return res;
}

export function updateHashValueWithFormat(attribute : string, value : any, runtimeType : JsonRuntimeType, hash : any) : boolean {
    const delimiters = ['/', '\\', '.'];
    switch (runtimeType) {
        case 'null':
        case 'boolean':
        case 'number':
        case 'string':
            return false;
        default:
            if(runtimeType.base == "object") {
                let dpos = attribute.length;
                for(const d of delimiters) {
                    const v = attribute.indexOf(d);
                    if(v >= 1) dpos = Math.min(dpos, v);
                }
                const attr = attribute.substring(0, dpos);
                if(!(attr in runtimeType.keyValues)) return false;
                if(!(attr in hash)) return false;
                
                const chT = runtimeType.keyValues[attr];
                if(chT == 'null'){
                } else if(chT == 'boolean'){
                    value = value.toLowerCase();
                    const Trues  = ['on', 'yes', 'y', 'true', 't', '1'];
                    const Falses = ['off', 'no', 'n', 'false', 'f', '0'];
                    if(Trues.indexOf(value) >= 0){
                        hash[attr] = true; return true;
                    }
                    if(Falses.indexOf(value) >= 0) {
                        hash[attr] = false; return true;
                    }
                    return false;
                } else if(chT == 'number'){
                    const v = parseInt(value);
                    if(v.toString() == value){
                        hash[attr] = v; return true;
                    }
                } else if(chT == 'string'){
                    hash[attr] = value;
                    return true;
                } else if(chT.base == 'union') {
                    for(let doLower = 0; doLower <= 1; ++doLower){
                        for(const elem of chT.elements){
                            if(elem == 'null' || elem == 'boolean' || elem == 'number' || elem == 'string'){
                            } else if(elem.base == 'literal') {
                               if((doLower == 0 && elem.value == value) || 
                                  (doLower == 1 && elem.value.toLowerCase() == value.toLowerCase())
                               ){
                                    hash[attr] = elem.value;
                                    return true;
                               }
                            }
                        }
                    }
                } else if(chT.base == 'optional') {
                    if(chT.element == 'string'){
                        hash[attr] = value;
                        return true;
                    } else if(chT.element == 'number'){
                        const v = parseInt(value);
                        if(v.toString() == value){
                            hash[attr] = v;
                            return true;
                        }
                    }
                } else if(chT.base == 'object') {
                    if(dpos != attribute.length){
                        return updateHashValueWithFormat(attribute.substring(dpos+1, attribute.length), value, chT, hash[attr]);
                    }
                }
                return false;
            }
    }
    return false;
}



