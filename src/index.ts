import * as Discord from "discord.js";
import * as fs from "fs"
import * as argv from "argv"
import {isValid, JsonRuntimeType, validate} from 'ts-json-validator';
import {LangTypeFormat, LangType, RuleType, ServerSettingsFormat} from "./JsonType";
import GameState from "./GameState"
import {GameChannels, isThisCommand, loadAndSetSysRuleSet} from "./GameUtils"
import {HttpServer} from "./HttpServer"
const JSON5 = require('json5');
const util = require('util');


argv.option([
    {
        name:  'server_setting',
        short: 's',
        type: 'list,path',
        description :'Specify the location of your own server configuration file.',
        example: "'-s local_private/my_server_settings.json5'"
    }
]);
const arg = argv.run();


const ServerSetting = loadAndSetServerSetting('./server_settings/default.json5', arg.options["server_setting"]);
// console.log("ServerSetting", ServerSetting)

const SysLangTxt = loadAndSetSysLangTxt("./lang/" + ServerSetting.system_lang + ".json5");
const SysRuleSet = loadAndSetSysRuleSet("./rule_setting_templates/default.json5");

if (SysLangTxt    == null) { throw new Error('SysLangTxt is Wrong! lang:' + ServerSetting.system_lang);}
if (SysRuleSet    == null) { throw new Error('SysRuleSet is Wrong!');}

const clients = [new Discord.Client(), new Discord.Client()];

const Games: { [key: string]: GameState; } = {};


clients[0].on("ready", () => {console.log("Login! ", clients[0].user ? clients[0].user.username : "");});
clients[1].on("ready", () => {console.log("Login! ", clients[1].user ? clients[1].user.username : "");});

const httpServer : HttpServer = new HttpServer(ServerSetting, SysLangTxt);

function loadAndSetSysLangTxt(path : string, LangTxt ?: LangType){
    const data = fs.readFileSync(path, 'utf-8');
    const json5 = JSON5.parse(data);
    try {
        const ret = validate(LangTypeFormat, json5);
        if(ret != null) LangTxt = ret;
        return ret;
    } catch (e) {
        console.log(e);
    }
}


function get_env(str : string){
    let res = "";
    if(str.startsWith('$')){
        str = str.substring(1);
        if(!(str in process.env)) throw new Error("Env " + str + " doesn't exist!");
        const e = process.env[str];
        if(e == null) throw new Error("Env " + str + "doesn't exist!");
        res = e;
    } else {
        res = str.substring(1)
    }
    return res;
}

function isValidJsonRuntimeType(runtimeType: JsonRuntimeType, obj: any): boolean {
    switch (runtimeType) {
    case 'null':
        if(obj === null) return true;
        break;
    case 'boolean':
    case 'number':
    case 'string':
        if(typeof obj === runtimeType) return true;
        break;
    default:
        switch (runtimeType.base) {
        case 'literal':
            if(obj === runtimeType.value) return true;
            break;
        case 'optional':
            if(obj === undefined) return true;
            if(isValid(runtimeType.element, obj)) return true;
            break;
        case "union":
            if(runtimeType.elements.some((t) => isValid(t, obj))) return true;
            break;
        case "array":
            if(obj instanceof Array && obj.every((e) => isValid(runtimeType.element, e))) return true;
            break;
        case "tuple":
            const res = obj instanceof Array &&
                runtimeType.elements.length === obj.length &&
                runtimeType.elements.every((typ, i) => isValid(typ, obj[i]));
            if(res) return true;
            break;
        case "object":
            if (obj === null || typeof obj !== 'object') {
            } else if(Object.entries(runtimeType.keyValues).every(([key, typ]) => isValidJsonRuntimeType(typ, obj[key]))){
                return true;
            }
            break;
        }
    }
    console.error("runtimeType :", runtimeType);
    console.error("obj type    :", typeof obj);
    console.error("obj         :", obj);
    throw new Error("Json Type parse error!!");
}


function loadAndSetServerSetting(default_path : string, server_setting_files : any){
    var files : string[] = [default_path];
    if(server_setting_files instanceof Array){
        for(const f of server_setting_files){
            if(typeof f !== 'string') continue;
            files.push(f);
        }
    }
    let resTmp : any = new Object();
    for(const path of files){
        const rawFile = fs.readFileSync(path, 'utf-8');
        const jsonObj = JSON5.parse(rawFile);
        Object.assign(resTmp, jsonObj);
        resTmp = validate(ServerSettingsFormat, resTmp);
        if (resTmp == null) { 
            isValidJsonRuntimeType(ServerSettingsFormat.runtimeType, resTmp);
            throw new Error('ServerSetting is Wrong! File : ' + path);
        }
    }
    let res = validate(ServerSettingsFormat, resTmp);
    if (res == null) throw new Error('ServerSetting is Wrong!');
    res.token1 = get_env(res.token1);
    res.token2 = get_env(res.token2);
    res.http.addr = get_env(res.http.addr);
    res.http.ip        = get_env(res.http.ip);
    res.http.http_port = get_env(res.http.http_port);
    let GMs : string[] = [];
    for(const s of res.system_GM){
        const t = get_env(s).split(' ');
        GMs = GMs.concat(t);
    }
    res.system_GM = GMs;
    return res;
}

function has_room_all_game_channel_support_t(
    catId : string, 
    find_name : string, 
    channels : Discord.GuildChannelManager) : Discord.TextChannel | null{
    var ret : Discord.TextChannel | null  = null;
    const targetChannel = channels.cache.find(c => (c.parentID == catId && c.name == find_name));
    if(targetChannel == null) return null;
    if (!((targetChannel): targetChannel is Discord.TextChannel => targetChannel.type === 'text')(targetChannel)) return null;
    return targetChannel;
}
function has_room_all_game_channel_support_v(
    catId : string, 
    find_name : string, 
    channels : Discord.GuildChannelManager) : Discord.VoiceChannel | null{
    var ret : Discord.VoiceChannel | null  = null;
    const targetChannel = channels.cache.find(c => (c.parentID == catId && c.name == find_name));
    if(targetChannel == null) return null;
    if (!((targetChannel): targetChannel is Discord.VoiceChannel => targetChannel.type === 'voice')(targetChannel)) return null;
    return targetChannel;
}

function has_room_all_game_channel(catId : string, channels : Discord.GuildChannelManager, SrvLangTxt : LangType) : GameChannels | null{
    const aLivingVoice = has_room_all_game_channel_support_v(catId, SrvLangTxt['game']["room_LivingVoice"], channels); if(aLivingVoice == null) return null;
    const aDeadVoice   = has_room_all_game_channel_support_v(catId, SrvLangTxt['game']["room_DeadVoice"]  , channels); if(aDeadVoice   == null) return null;
    const aWerewolf    = has_room_all_game_channel_support_t(catId, SrvLangTxt['game']["room_Werewolf"]   , channels); if(aWerewolf    == null) return null;
    const aGameLog     = has_room_all_game_channel_support_t(catId, SrvLangTxt['game']["room_GameLog"]    , channels); if(aGameLog     == null) return null;
    const aDebugLog    = has_room_all_game_channel_support_t(catId, SrvLangTxt['game']["room_DebugLog"]   , channels); if(aDebugLog    == null) return null;
    const aLiving      = has_room_all_game_channel_support_t(catId, SrvLangTxt['game']["room_Living"]     , channels); if(aLiving      == null) return null;
    const aDead        = has_room_all_game_channel_support_t(catId, SrvLangTxt['game']["room_Dead"]       , channels); if(aDead        == null) return null;
    return new GameChannels(
        aWerewolf   ,
        aGameLog    ,
        aDebugLog   ,
        aLiving     ,
        aLivingVoice,
        aDead       ,
        aDeadVoice
    );
}

function getGameChannels2(ch : GameChannels, gch : Discord.GuildChannelManager) : GameChannels | null{
    let aWerewolf    : Discord.TextChannel  | null = null;
    let aGameLog     : Discord.TextChannel  | null = null;
    let aDebugLog    : Discord.TextChannel  | null = null;
    let aLiving      : Discord.TextChannel  | null = null;
    let aLivingVoice : Discord.VoiceChannel | null = null;
    let aDead        : Discord.TextChannel  | null = null;
    let aDeadVoice   : Discord.VoiceChannel | null = null;
    gch.cache.forEach(function (c, key) {
        if(ch.Werewolf   .id == c.id && ((c): c is Discord.TextChannel => c.type === 'text')(c)) aWerewolf    = c;
        if(ch.GameLog    .id == c.id && ((c): c is Discord.TextChannel => c.type === 'text')(c)) aGameLog     = c;
        if(ch.DebugLog   .id == c.id && ((c): c is Discord.TextChannel => c.type === 'text')(c)) aDebugLog    = c;
        if(ch.Living     .id == c.id && ((c): c is Discord.TextChannel => c.type === 'text')(c)) aLiving      = c;
        if(ch.LivingVoice.id == c.id && ((c): c is Discord.VoiceChannel=> c.type === 'voice')(c))aLivingVoice = c;
        if(ch.Dead       .id == c.id && ((c): c is Discord.TextChannel => c.type === 'text')(c)) aDead        = c;
        if(ch.DeadVoice  .id == c.id && ((c): c is Discord.VoiceChannel=> c.type === 'voice')(c))aDeadVoice   = c;
    });
    if(aWerewolf   == null) return null;
    if(aGameLog    == null) return null;
    if(aDebugLog   == null) return null;
    if(aLiving     == null) return null;
    if(aLivingVoice== null) return null;
    if(aDead       == null) return null;
    if(aDeadVoice  == null) return null;
    return new GameChannels(
        aWerewolf   ,
        aGameLog    ,
        aDebugLog   ,
        aLiving     ,
        aLivingVoice,
        aDead       ,
        aDeadVoice
    );
}


async function make_room(message : Discord.Message, SrvLangTxt : LangType){
    // TODO : 未実装
    const guild = message.guild;
    if(guild == null) return;

    message.channel.send(SrvLangTxt.p0.make_room)
    const category_name = "game2"
    let Werewolf    : Discord.TextChannel  | null = null;
    let GameLog     : Discord.TextChannel  | null = null;
    let DebugLog    : Discord.TextChannel  | null = null;
    let Living      : Discord.TextChannel  | null = null;
    let LivingVoice : Discord.VoiceChannel | null = null;
    let Dead        : Discord.TextChannel  | null = null;
    let DeadVoice   : Discord.VoiceChannel | null = null;

    const cat = await guild.channels.create(category_name,{type : 'category'});
    Werewolf    = await guild.channels.create(SrvLangTxt.game.room_Werewolf   , {type : 'text',  parent : cat.id, position : 2});
    GameLog     = await guild.channels.create(SrvLangTxt.game.room_GameLog    , {type : 'text',  parent : cat.id, position : 3});
    DebugLog    = await guild.channels.create(SrvLangTxt.game.room_DebugLog   , {type : 'text',  parent : cat.id, position : 4});
    Living      = await guild.channels.create(SrvLangTxt.game.room_Living     , {type : 'text',  parent : cat.id, position : 5});
    LivingVoice = await guild.channels.create(SrvLangTxt.game.room_LivingVoice, {type : 'voice', parent : cat.id, position : 6});
    Dead        = await guild.channels.create(SrvLangTxt.game.room_Dead       , {type : 'text',  parent : cat.id, position : 7});
    DeadVoice   = await guild.channels.create(SrvLangTxt.game.room_DeadVoice  , {type : 'voice', parent : cat.id, position : 8});
    return new GameChannels(
        Werewolf   ,
        GameLog    ,
        DebugLog   ,
        Living     ,
        LivingVoice,
        Dead       ,
        DeadVoice
    );
}


async function on_message(bid : number, message : Discord.Message){
    if (clients[0].user == null || message.author.id == clients[0].user.id) return;
    if (clients[1].user == null || message.author.id == clients[1].user.id) return;
    if (message.content.startsWith('^ping1')) {
        if(bid == 0) message.channel.send("pong 1!");
        return;
    }
    if (message.content.startsWith('^ping2')) {
        if(bid == 1) message.channel.send("pong 2!");
        return;
    }
    if (message.content.startsWith('^ping')) {
        message.channel.send("pong!"); return;
    }
    if(bid == 1) return;
    // console.log("text > ", message.content);
    
    const message_channel = message.channel;

    if(SysLangTxt != null && SysRuleSet != null && ('parentID' in message_channel)){
        const SrvLangTxt : LangType = SysLangTxt;
        const SrvRuleSet : RuleType = SysRuleSet;
        const paID = message_channel.parentID;

        if(paID != null){
            if(Object.keys(Games).find((v : string ) => v == paID) != null){
                await Games[paID].command(message);
                return;
            }
            const u = clients[0].user;
            if(message.guild && message.mentions.users.find(mu => mu.id == u.id)){
                const guild1 = message.guild;
                const ch = has_room_all_game_channel(paID, guild1.channels, SrvLangTxt)
                if(ch != null){
                    let guild2 = clients[1].guilds.cache.find(g => g.id == guild1.id);
                    if(guild2 != null){
                        const ch2 = getGameChannels2(ch, guild2.channels);
                        if(ch2 != null){
                            Games[paID] = new GameState(clients, Games, message.guild, ch, ch2, paID, httpServer, SrvLangTxt, SrvRuleSet, ServerSetting);
                            ch.Living.send(SrvLangTxt.p0.rediscovered_room)
                            Games[paID].start_1Wanted();
                            await Games[paID].command(message);
                            if(ServerSetting.auto_voice_link){
                                Games[paID].voiceChannelsLink();
                            }
                        }
                        return
                    }
                }
            }
        }
        if(isThisCommand(message.content, SrvLangTxt.sys.cmd_make_room) >= 0){
            const u = clients[0].user;
            if(message.mentions.users.find(mu => mu.id == u.id) == null) return;
            const guild1_old = message.guild;
            if (guild1_old == null) return;
            
            const ch = await make_room(message, SrvLangTxt);
            const guild1 = await guild1_old.fetch();
            if(guild1 == null) return;
            let guild2 = clients[1].guilds.cache.find(g => g.id == guild1.id);
            if(guild2 != null) guild2 = await guild2.fetch();
            if(ch == null || guild2 == null) return;
            const pa = ch.Living.parentID;
            const ch2 = getGameChannels2(ch, guild2.channels);
            if(pa == null || ch2 == null) return;
            Games[pa] = new GameState(clients, Games, guild1, ch, ch2, pa, httpServer, SrvLangTxt, SrvRuleSet, ServerSetting);
            Games[pa].updateRoomsRW();
            ch.Living.send("<@!" + message.author.id + "> done!");
            Games[pa].start_1Wanted();
            if(ServerSetting.auto_voice_link){
                Games[pa].voiceChannelsLink();
            }
            return
        }
    }
}


clients[0].on("message", async message => await on_message(0, message));
clients[1].on("message", async message => await on_message(1, message));

clients[0].on('messageReactionAdd', (reaction, user) => {
    if (clients[0].user == null || user.id == clients[0].user.id) return;
    if (clients[1].user == null || user.id == clients[1].user.id) return;
    if(reaction.message.channel.type === 'text'){
        if(reaction.message.channel.parentID != null){
            const pid = reaction.message.channel.parentID;
            if(Object.keys(Games).find((v : string ) => v == pid) != null){
                Games[pid].reactCommand(reaction, user as Discord.User);
            }
        }
    }
});



const token1 = ServerSetting.token1;
const token2 = ServerSetting.token2;

clients[0].login(token1)
clients[1].login(token2)
