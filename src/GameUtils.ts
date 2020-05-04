import * as Discord from "discord.js";
import * as fs from "fs"
import {validate} from 'ts-json-validator';
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