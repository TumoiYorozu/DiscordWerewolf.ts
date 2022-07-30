import * as Discord from "discord.js";
import LiveStream     from "./LiveStream"
import {GameChannels, format, isThisCommand, assertUnreachable, shuffle, loadAndSetSysRuleSet, updateHashValueWithFormat} from "./GameUtils"
import * as Util from "./GameUtils"
import {LangType, RuleType, RolesStr, FortunePriestType, ServerSettingsType, RuleTypeFormat} from "./JsonType";
import {HttpServer, HttpGameState} from "./HttpServer"

export const Phase = {
    p0_UnStarted   : '0.UnStarted',
    p1_Wanted      : '1.Wanted',
    p2_Preparation : '2.Preparation',
    p3_FirstNight  : '3.FirstNight',
    p4_Daytime     : '4.Daytime',
    p5_Vote        : '5.Vote',
    p6_Night       : '6.Night',
    p7_GameEnd     : '7.GameEnd',
} as const;
type Phase = typeof Phase[keyof typeof Phase];

const Role = stringToEnum([
    'Villager',
    'Seer',
    'Priest',
    'Knight',
    'Werewolf',
    'Traitor',
    'Mason',
    'Dictator',
    'Baker',
    'Communicatable'
]);
type Role = keyof typeof RolesStr.tsType;


const TeamNames = stringToEnum([
    'Good',
    'Evil',
    'Other'
]);
type TeamNames = keyof typeof TeamNames;

function getDefaultTeams(r : Role){
    switch (r) {
        case Role.Villager:
        case Role.Seer:
        case Role.Priest:
        case Role.Knight:
        case Role.Mason:
        case Role.Dictator:
        case Role.Baker:
            return TeamNames.Good;
        case Role.Werewolf:
        case Role.Traitor:
        case Role.Communicatable:
            return TeamNames.Evil;
        default:
            assertUnreachable(r);
    }
}
function whatTeamFortuneResult(r : Role){
    switch (r) {
        case Role.Villager:
        case Role.Seer:
        case Role.Priest:
        case Role.Knight:
        case Role.Mason:
        case Role.Dictator:
        case Role.Baker:
        case Role.Traitor:
        case Role.Communicatable:
            return TeamNames.Good;
        case Role.Werewolf:
            return TeamNames.Evil;
        default:
            assertUnreachable(r);
    }
}

function stringToEnum<T extends string>(o: T[]): {[K in T]: K} {
    return o.reduce((accumulator, currentValue) => {
      accumulator[currentValue] = currentValue;
      return accumulator;
    }, Object.create(null));
}


function getUserMentionStrFromId(uid: string){
    return "<@!" + uid + ">"
}
function getUserMentionStr(user: Discord.User){
    return "<@!" + user.id + ">"
}

// Binary string to ASCII (base64)
function btoa(bin : string) {
    return Buffer.from(bin, 'binary').toString('base64');
  }
function bnToB64(bn : bigint) {
    var hex = BigInt(bn).toString(16);
    if (hex.length % 2) { hex = '0' + hex; }
    var bin = [];
    var i = 0;
    var d;
    var b;
    while (i < hex.length) {
      d = parseInt(hex.slice(i, i + 2), 16);
      b = String.fromCharCode(d);
      bin.push(b);
      i += 2;
    }
    return btoa(bin.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getNicknameFromMes(message : Discord.Message){
    return (message.member != null && message.member.nickname != null ? message.member.nickname : message.author.username);
}

function getNicknameFromMem(mem : Discord.GuildMember){
    return (mem.nickname != null ? mem.nickname : mem.user.username);
}

class GameMember {
    user            : Discord.User;
    member          : Discord.GuildMember | null;
    uchannel        : Discord.TextChannel | null = null;
    uchannel2       : Discord.TextChannel | null = null;
    role            : Role | null = null;
    wishRole        : { [key: string]: number; }  = Object.create(null);
    allowWolfRoom   : boolean     = false;
    actionLog       : [string, TeamNames][] = [];
    isLiving        : boolean  = true;
    deadReason      : KickReason = KickReason.Living;
    alpStr          : string   = "";
    validVoteID     : string[] = [];
    voteTo          : string   = "";
    livingDays      : number   = -1;
    avatar          : string;
    nickname        : string;
    firstCallCoTime : number | null = null;
    coRole          : Role   | null = null;
    callLog         : [string, boolean][] = [];
    roleCmdInvokeNum:number    = 0;
    constructor(m : Discord.GuildMember) {
        this.user = m.user;
        this.member = m;
        this.nickname = getNicknameFromMem(m);
        const ava = m.user.displayAvatarURL();
        this.avatar = ((ava == null) ? "" : ava);
        this.reset();
    }
    reset() {
        this.role = null;
        this.wishRole    = Object.create(null);
        this.allowWolfRoom = false;
        this.actionLog = [];
        this.isLiving = true;
        this.deadReason = KickReason.Living
        this.alpStr   = "";
        this.validVoteID = [];
        this.voteTo = ""
        this.livingDays = -1;
        this.firstCallCoTime = null;
        this.coRole     = null;
        this.callLog    = [];
        this.roleCmdInvokeNum = 0;
    }
}

const Admin_alw :Discord.Permissions= new Discord.Permissions([
    'VIEW_CHANNEL', 'CONNECT',
    'ADD_REACTIONS', 'SEND_MESSAGES', 'MANAGE_CHANNELS', 'SPEAK',
    'EMBED_LINKS', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS']);
const Admin_dny :Discord.Permissions= new Discord.Permissions();

const RW_alw : Discord.Permissions= new Discord.Permissions([
    'VIEW_CHANNEL', 'CONNECT',
    'ADD_REACTIONS', 'SEND_MESSAGES', 'SPEAK']);
const RW_dny : Discord.Permissions= new Discord.Permissions([]);
    
const ReadOnly_alw : Discord.Permissions= new Discord.Permissions(
    ['VIEW_CHANNEL', 'CONNECT']);
const ReadOnly_dny : Discord.Permissions= new Discord.Permissions(
    ['ADD_REACTIONS', 'SEND_MESSAGES', 'SPEAK']);

const ViewOnly_alw : Discord.Permissions= new Discord.Permissions(
    ['VIEW_CHANNEL', ]);
const ViewOnly_dny : Discord.Permissions= new Discord.Permissions(
    ['CONNECT', 'ADD_REACTIONS', 'SEND_MESSAGES', 'SPEAK']);
    
const NoAccess_alw : Discord.Permissions= new Discord.Permissions([]);
const NoAccess_dny : Discord.Permissions= new Discord.Permissions(
    ['VIEW_CHANNEL', 'CONNECT',
    'ADD_REACTIONS', 'SEND_MESSAGES', 'SPEAK']);




const enum Perm {NoAccess, ReadOnly, ViewOnly, RW, Admin}
function addPerm(id : string, p : Perm, perms : Discord.OverwriteResolvable[]){
    switch(p){
        case Perm.NoAccess: perms.push({id: id, allow: NoAccess_alw, deny:  NoAccess_dny}); return;
        case Perm.ViewOnly: perms.push({id: id, allow: ViewOnly_alw, deny:  ViewOnly_dny}); return;
        case Perm.ReadOnly: perms.push({id: id, allow: ReadOnly_alw, deny:  ReadOnly_dny}); return;
        case Perm.RW:       perms.push({id: id, allow: RW_alw,       deny:  RW_dny      }); return;
        case Perm.Admin:    perms.push({id: id, allow: Admin_alw,    deny:  Admin_dny   }); return;
        default: assertUnreachable(p);
    }
}

enum InteractType {
    Accept,
    WishRole,
    Vote,
    Knight,
    Seer,
    Werewolf,
    CO_Call,
    Dictator,
    CutTime,
}

export enum KickReason {
    Vote,
    Werewolf,
    Living,
}


export default class GameState {
    clients      : Discord.Client[];
    guild        : Discord.Guild;
    guild2       : Discord.Guild;
    srvSetting   : ServerSettingsType;
    langTxt      : LangType;
    ruleSetting  : RuleType;
    upperGames   : { [key: string]: GameState};
    parentID     : string;
    channels     : GameChannels;
    channels2    : GameChannels;
    streams      : LiveStream;
    phase        : Phase;
    gameId       : number;
    GM           : { [key: string]: Discord.GuildMember | null; } = Object.create(null);
    developer    : { [key: string]: Discord.GuildMember | null; } = Object.create(null);
    httpServer   : HttpServer;
    gameSessionID : string;
    
    defaultRoles : { [key: string]: number; }  = Object.create(null);
    emoText      : { [key: string]: string; }  = Object.create(null);
    roleText     : { [key: string]: string; }  = Object.create(null);

    members     : { [key: string]: GameMember; }  = Object.create(null);
    reqMemberNum : number = 0;
    
    interactControllers : { [key: string]: Discord.Message; }[] = [];
    reactedMember : { [key: string]: number; }  = Object.create(null);
    cutTimeMember : { [key: string]: number; }  = Object.create(null);
    p2CanForceStartGame : boolean;
    remTime         : number;
    daytimeStartTime: number = 0;
    stopTimerRequest: boolean;
    isTimerProgress : boolean;
    dayNumber       : number;
    killNext        : [string, number][];
    voteNum         : number;
    runoffNum       : number;
    lastExecuted    : string;
    wolfVote        : string;
    wolfValidTo     : string[];
    wolfValidFrom   : string[];
    wolfLog         : string[];
    dictatorVoteMode: string = "";
    httpGameState   : HttpGameState;
    timerList       : NodeJS.Timer[];

    constructor(clients : Discord.Client[], upperGames : {[key: string]: GameState}, guild : Discord.Guild, guild2 : Discord.Guild, ch : GameChannels, ch2 : GameChannels, parentID : string, httpServer : HttpServer, srvLangTxt : LangType, srvRuleSetting : RuleType, srvSetting : ServerSettingsType) {
        this.clients     = clients;
        this.upperGames  = upperGames;
        this.guild       = guild;
        this.guild2      = guild2;
        this.loadLang(srvLangTxt);
        this.langTxt     = srvLangTxt;
        this.ruleSetting = srvRuleSetting;
        this.srvSetting  = srvSetting;
        this.channels    = ch;
        this.channels2   = ch2;
        this.parentID    = parentID;
        this.gameId      = -1;
        this.p2CanForceStartGame = false;
        this.remTime     = -1;
        this.stopTimerRequest  = false;
        this.isTimerProgress   = false;
        this.dayNumber   = -1;
        this.killNext    = [];
        this.voteNum     = 0;
        this.runoffNum   = 0;
        this.lastExecuted  = "";
        this.wolfVote      = "";
        this.wolfValidTo   = [];
        this.wolfValidFrom = [];
        this.wolfLog       = [];
        this.httpServer    = httpServer;
        this.gameSessionID = this.resetServerSession();
        this.httpGameState = this.httpServer.games[this.gameSessionID];
        this.timerList   = [];

        this.reset()
        this.setRoles(this.ruleSetting)
        this.streams     = new LiveStream(ch, ch2, this.httpGameState, srvLangTxt, srvRuleSetting, guild, guild2);
        this.phase       = Phase.p0_UnStarted;
        for(const idx in srvSetting.system_GM){
            this.GM[srvSetting.system_GM[idx]] = null;
        }
    }
    loadLang(srvLangTxt : LangType){
        this.langTxt     = srvLangTxt;
        this.emoText  = srvLangTxt.emo  as {[key: string]: string};
        this.roleText = srvLangTxt.role as {[key: string]: string};
    }
    reset(){
        for(let timer of this.timerList){
            clearTimeout(timer);
        }
        this.timerList = [];
        this.phase = Phase.p0_UnStarted
        for(const uid in this.members){
            this.members[uid].reset();
        }
        this.resetReactedMember();
        this.gameId = Math.floor(Math.random() * 0x40000000);
        this.interactControllers = [];
        this.p2CanForceStartGame = false;
        this.remTime     = -1;
        this.stopTimerRequest = false;
        this.isTimerProgress  = false;
        this.dayNumber       = -1;
        this.killNext        = [];
        this.lastExecuted = "";
        this.wolfVote      = "";
        this.wolfValidTo   = [];
        this.wolfValidFrom = [];
        this.wolfLog       = [];
        this.dictatorVoteMode = "";
        for(let key in InteractType){
            this.interactControllers.push(Object.create(null));
        }
        this.phase       = Phase.p0_UnStarted;
    }
    destroy(){
        this.channels.Living.send(this.langTxt.p7.breakup);
        this.streams.destroy();
        this.httpServer.destroySession(this.httpGameState.sid);
    }

    resetServerSession(){
        let b :bigint = 0n;
        b += BigInt(Math.floor(Math.random()*65536)) * 0x1n;
        b += BigInt(Math.floor(Math.random()*65536)) * 0x1_0000n;
        b += BigInt(Math.floor(Math.random()*65536)) * 0x1_0000_0000n;
        const sid = bnToB64(b);
        console.log("Session ID : ", sid);
        const httpURL = this.httpServer.registerSession(sid, this);
        console.log("HTTP URL : ", httpURL);
        this.channels.Living.send({embeds: [{
            title: this.langTxt.sys.sys_start_browser,
            description : httpURL,
            color: this.langTxt.sys.system_color,
        }]});
        // console.trace("ブラウザモニターを開始しました");
        return sid;
    }
    err(){
        console.error("An error has occurred.");
        console.trace();
        this.channels.Living.send("An error has occurred...");
    }

    sendMemberList(ch : Discord.TextChannel){
        const now_num = Object.keys(this.members).length;
        let   text : string = "";

        Object.keys(this.members).forEach((key, idx) => {
            text += this.members[key].nickname + "\n";
        });
        ch.send({embeds: [{
            title: format(this.langTxt.sys.Current_join_member_num, {num : now_num, max : this.reqMemberNum}),
            description : text,
            color: this.langTxt.sys.system_color,
        }]});
    }

    getCategory64(){
        return bnToB64(BigInt(this.parentID));
    }

    ////////////////////////////////////////////
    setRoles(r : RuleType){
        this.defaultRoles = Object.create(null);
        this.reqMemberNum = 0;
        for(let key in Role){
            if(key in r.role_nums){
                const nums = r.role_nums as {[key: string]:  number};
                if(0 < nums[key]){
                    this.defaultRoles[key]  = nums[key];
                    this.reqMemberNum += nums[key];
                }
            }
        }
        console.log(this.defaultRoles);
    }
    addRole(r : Role, num : number = 1){
        console.log("addRole", r, num)
        if(r in this.defaultRoles){
            this.defaultRoles[r] += num;
        } else {
            this.defaultRoles[r] = num;
        }
        this.reqMemberNum += num;
    }
    setRolesStr(s : string){
        console.log(s);
        this.defaultRoles = Object.create(null);
        this.reqMemberNum = 0;
        for (var i = 0; i < s.length; i++) {
            if(s[i] == 'V') this.addRole(Role.Villager);
            if(s[i] == 'S') this.addRole(Role.Seer);
            if(s[i] == 'P') this.addRole(Role.Priest);
            if(s[i] == 'K') this.addRole(Role.Knight);
            if(s[i] == 'M') this.addRole(Role.Mason);
            if(s[i] == 'D') this.addRole(Role.Dictator);
            if(s[i] == 'B') this.addRole(Role.Baker);

            if(s[i] == 'W') this.addRole(Role.Werewolf);
            if(s[i] == 'T') this.addRole(Role.Traitor);
            if(s[i] == 'C') this.addRole(Role.Communicatable);
        }
        console.log(this.defaultRoles);
        this.sendWantNums(this.channels.Living);
        this.updateWantedEmb(null);
    }
    sendWantNums(tch: Discord.TextChannel){
        let team     : {[key: string]: string} = Object.create(null);
        let team_cnt : {[key: string]: number} = Object.create(null);
        let all_cnt = 0;
        for(const key in TeamNames){
            team[key] = "";
            team_cnt[key] = 0;
        }
        for(const r in this.defaultRoles){
            const t = getDefaultTeams(r as Role);
            team[t] += this.emoText[r] + this.roleText[r] + " : " + this.defaultRoles[r] + "\n";
            team_cnt[t] += this.defaultRoles[r];
            all_cnt += this.defaultRoles[r];
        }
        let rules_txt = "";
        if(this.defaultRoles[Role.Seer]) {
            rules_txt += this.langTxt.rule.first_nights_fortune.txt + ":" + this.langTxt.rule.first_nights_fortune[this.ruleSetting.first_nights_fortune] + "\n";
        }
        if(this.defaultRoles[Role.Knight]) {
            rules_txt += this.langTxt.rule.continuous_guard.txt + ":" + this.langTxt.rule.continuous_guard[this.ruleSetting.continuous_guard ? "yes" : "no"] + "\n";
        }
        {
            rules_txt += this.langTxt.rule.vote_place.txt + ":" + this.langTxt.rule.vote_place[this.ruleSetting.vote.place] + "\n";
            rules_txt += this.langTxt.rule.vote_num.txt   + ": " + String(this.ruleSetting.vote.revote_num + 1) + "\n";
            rules_txt += this.langTxt.rule.vote_even.txt  + ":" + this.langTxt.rule.vote_even[this.ruleSetting.vote.when_even] + "\n";
        }


        let fields : Discord.EmbedField[] = [];

        if(team[TeamNames.Good] != "") { fields.push({
            name : this.langTxt.team_name.Good + "  " +
            format(this.langTxt.sys.Current_role_breakdown_sum, {num : team_cnt[TeamNames.Good]}),
            value: team[TeamNames.Good], inline : true});
        }
        if(team[TeamNames.Evil] != "") { fields.push({
            name : this.langTxt.team_name.Evil + "  " +
            format(this.langTxt.sys.Current_role_breakdown_sum, {num : team_cnt[TeamNames.Evil]}),
            value: team[TeamNames.Evil], inline : true});
        }
        if(team[TeamNames.Other] != "") { fields.push({
            name : this.langTxt.team_name.Other + "  " +
            format(this.langTxt.sys.Current_role_breakdown_sum, {num : team_cnt[TeamNames.Other]}),
            value: team[TeamNames.Other], inline : true});
        }
        fields.push({
            name : this.langTxt.rule.title,
            value: rules_txt, inline : false});

        tch.send({embeds: [{
            title: this.langTxt.sys.Current_role_breakdown,
            description : format(this.langTxt.sys.Current_role_breakdown_sum, {num : all_cnt}),
            color: this.langTxt.sys.system_color,
            fields : fields,
        }]});
    }
    changeRule(rulesStr : string) {
        const delimiters = [':', '='];
        let res = "";
        let changed = false;
        for(let rule of rulesStr.split('\n')){
            rule = rule.trim();
            let dpos = rule.length;
            for(const d of delimiters) {
                const v = rule.indexOf(d);
                if(v >= 1) dpos = Math.min(dpos, v);
            }
            if(dpos >= rule.length) {const v = rule.indexOf(' ');   if(v >= 1) dpos = v;}
            if(dpos >= rule.length) {const v = rule.indexOf(' \t'); if(v >= 1) dpos = v;}
            if(dpos >= rule.length) continue;
            const attribute = rule.substring(0, dpos).trim();
            const value     = rule.substring(dpos+1, rule.length).trim();
            if(attribute.length == 0 || value.length == 0) continue;
            console.log("attribute : ", attribute);
            console.log("value     : ", value);
            const r = updateHashValueWithFormat(attribute, value, RuleTypeFormat.runtimeType, this.ruleSetting);
            changed = changed || r;
            if(!r) {
                res += "Failed to set the value. attribute : " + attribute + " value : " + value + "\n";
            }
        }
        if(res != ""){
            this.channels.Living.send(res);
        }
        if(changed) {
            this.sendWantNums(this.channels.Living);
        }
        console.log(this.ruleSetting);
    }

    async start_1Wanted(){
        this.phase = Phase.p1_Wanted;
        this.updateRoomsRW();
        this.sendWantNums(this.channels.Living);
        const join_button = Util.make_button("join", this.langTxt.p1.cmd_join[0], {style : "green", emoji: this.langTxt.role_uni.Werewolf});
        const sent_message = await this.channels.Living.send({
            content: this.langTxt.p0.start_recruiting,
            components: [ new Discord.MessageActionRow().addComponents(join_button) ]
        });
        this.interactControllers[InteractType.Accept][sent_message.id] = sent_message;
        this.httpGameState.updatePhase(this.langTxt.p1.phase_name);
        this.updateWantedEmb(null);

        this.httpGameState.updatePhase(this.langTxt.p1.phase_name);
    }
    sendWarn(ch : Discord.TextChannel, title : string, desc : string){
        ch.send({embeds: [{
            title: title,
            description : desc,
            color: this.langTxt.sys.system_warn_color,
            author: {name: "Warn!", iconURL: "https://twemoji.maxcdn.com/2/72x72/26a0.png"},
        }]});
    }
    sendErr(ch : Discord.TextChannel, title : string, desc : string){
        ch.send({embeds: [{
            title: title,
            description : desc,
            color: this.langTxt.sys.system_err_color,
            author: {name: "Error!", iconURL: "https://twemoji.maxcdn.com/2/72x72/1f6ab.png"},
        }]});
    }
    updateRoomsRW(){
        if(this.guild == null) return this.err();
        let permGMonly      : Discord.OverwriteResolvable[] = [{id: this.guild.id, allow: NoAccess_alw, deny:  NoAccess_dny}];
        let permReadOnly    : Discord.OverwriteResolvable[] = [{id: this.guild.id, allow: NoAccess_alw, deny:  NoAccess_dny}];
        const cu1 = this.clients[0].user;
        const cu2 = this.clients[1].user;
        if (this.guild.me != null) {
            addPerm(this.guild.me.id, Perm.Admin, permGMonly);
            addPerm(this.guild.me.id, Perm.Admin, permReadOnly);
        }

        this.channels.DebugLog.permissionOverwrites.set(permGMonly);
        this.channels.GameLog.permissionOverwrites.set(permGMonly); // or permReadOnly

        let permLiving      : Discord.OverwriteResolvable[] = [];
        let permLivingVoice : Discord.OverwriteResolvable[] = [];
        let permDead        : Discord.OverwriteResolvable[] = [];
        let permDeadVoice   : Discord.OverwriteResolvable[] = [];
        let permWerewolf    : Discord.OverwriteResolvable[] = [];

        switch (this.phase) {
            case Phase.p0_UnStarted:
            case Phase.p1_Wanted:
                // for @everyone
                addPerm(this.guild.id, Perm.RW      , permLiving     );
                addPerm(this.guild.id, Perm.RW      , permLivingVoice);
                addPerm(this.guild.id, Perm.ReadOnly, permDead       );
                addPerm(this.guild.id, Perm.RW,       permDeadVoice  );
                addPerm(this.guild.id, Perm.ViewOnly, permWerewolf   );
                break;
            case Phase.p2_Preparation:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.NoAccess, permWerewolf   );
                addPerm(this.guild.id, Perm.ReadOnly, permLiving     );
                addPerm(this.guild.id, Perm.ReadOnly, permLivingVoice);
                addPerm(this.guild.id, Perm.NoAccess, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                for(const uid in this.members) {
                    addPerm(uid, Perm.RW,       permLiving);
                    addPerm(uid, Perm.ReadOnly, permLivingVoice);
                    addPerm(uid, Perm.NoAccess, permDead       );
                    addPerm(uid, Perm.ViewOnly, permDeadVoice  );
                    if(this.members[uid].allowWolfRoom){
                        addPerm(uid, Perm.ReadOnly, permWerewolf);
                    } else {
                        addPerm(uid, Perm.NoAccess, permWerewolf);
                    }
                }
                break;
            case Phase.p3_FirstNight:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.NoAccess, permWerewolf   );
                addPerm(this.guild.id, Perm.ReadOnly, permLiving     );
                addPerm(this.guild.id, Perm.ReadOnly, permLivingVoice);
                addPerm(this.guild.id, Perm.NoAccess, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                for(const uid in this.members) {
                    addPerm(uid, Perm.ReadOnly, permLiving);
                    addPerm(uid, Perm.ReadOnly, permLivingVoice);
                    addPerm(uid, Perm.NoAccess, permDead       );
                    addPerm(uid, Perm.ViewOnly, permDeadVoice  );
                    if(this.members[uid].allowWolfRoom){
                        addPerm(uid, Perm.RW,       permWerewolf);
                    } else {
                        addPerm(uid, Perm.NoAccess, permWerewolf);
                    }
                }
                break;
            case Phase.p4_Daytime:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.NoAccess, permWerewolf   );
                addPerm(this.guild.id, Perm.ReadOnly, permLiving     );
                addPerm(this.guild.id, Perm.ReadOnly, permLivingVoice);
                addPerm(this.guild.id, Perm.NoAccess, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                for(const uid in this.members) {
                    if(this.members[uid].isLiving) {
                        addPerm(uid, Perm.RW,       permLiving);
                        addPerm(uid, Perm.RW,       permLivingVoice);
                        addPerm(uid, Perm.NoAccess, permDead       );
                        addPerm(uid, Perm.ViewOnly, permDeadVoice  );
                    } else {
                        addPerm(uid, Perm.ReadOnly, permLiving);
                        addPerm(uid, Perm.ReadOnly, permLivingVoice);
                        addPerm(uid, Perm.RW,       permDead       );
                        addPerm(uid, Perm.RW,       permDeadVoice  );
                    }
                    if(this.members[uid].allowWolfRoom){
                        const enableDaytimeWolfRoom = false;
                        if(enableDaytimeWolfRoom && this.members[uid].isLiving) {
                            addPerm(uid, Perm.RW,       permWerewolf);
                        } else {
                            addPerm(uid, Perm.ReadOnly, permWerewolf);
                        }
                    } else {
                        addPerm(uid, Perm.NoAccess, permWerewolf);
                    }
                }
                break;
            case Phase.p5_Vote:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.NoAccess, permWerewolf   );
                addPerm(this.guild.id, Perm.ReadOnly, permLiving     );
                addPerm(this.guild.id, Perm.ReadOnly, permLivingVoice);
                addPerm(this.guild.id, Perm.NoAccess, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                for(const uid in this.members) {
                    if(this.members[uid].isLiving) {
                        if(this.ruleSetting.vote.talk){
                            addPerm(uid, Perm.RW,       permLiving);
                            addPerm(uid, Perm.RW,       permLivingVoice);
                        }else{
                            addPerm(uid, Perm.ReadOnly, permLiving);
                            addPerm(uid, Perm.ReadOnly, permLivingVoice);
                        }
                        addPerm(uid, Perm.NoAccess, permDead       );
                        addPerm(uid, Perm.ViewOnly, permDeadVoice  );
                    } else {
                        addPerm(uid, Perm.ReadOnly, permLiving);
                        addPerm(uid, Perm.ReadOnly, permLivingVoice);
                        addPerm(uid, Perm.RW,       permDead       );
                        addPerm(uid, Perm.RW,       permDeadVoice  );
                    }
                    if(this.members[uid].allowWolfRoom){
                        if(this.members[uid].isLiving) {
                            addPerm(uid, Perm.ReadOnly, permWerewolf);
                        } else {
                            addPerm(uid, Perm.ReadOnly, permWerewolf);
                        }
                    } else {
                        addPerm(uid, Perm.NoAccess, permWerewolf);
                    }
                }
                break;
            case Phase.p6_Night:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.NoAccess, permWerewolf   );
                addPerm(this.guild.id, Perm.ReadOnly, permLiving     );
                addPerm(this.guild.id, Perm.ReadOnly, permLivingVoice);
                addPerm(this.guild.id, Perm.NoAccess, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                for(const uid in this.members) {
                    if(this.members[uid].isLiving) {
                        addPerm(uid, Perm.ReadOnly, permLiving);
                        addPerm(uid, Perm.ReadOnly, permLivingVoice);
                        addPerm(uid, Perm.NoAccess, permDead       );
                        addPerm(uid, Perm.ViewOnly, permDeadVoice  );
                    } else {
                        addPerm(uid, Perm.ReadOnly, permLiving);
                        addPerm(uid, Perm.ReadOnly, permLivingVoice);
                        addPerm(uid, Perm.RW,       permDead       );
                        addPerm(uid, Perm.RW,       permDeadVoice  );
                    }
                    if(this.members[uid].allowWolfRoom){
                        if(this.members[uid].isLiving) {
                            addPerm(uid, Perm.RW,       permWerewolf);
                        } else {
                            addPerm(uid, Perm.ReadOnly, permWerewolf);
                        }
                    } else {
                        addPerm(uid, Perm.NoAccess, permWerewolf);
                    }
                }
                break;
            case Phase.p7_GameEnd:
                // for @everyone(Guest)
                addPerm(this.guild.id, Perm.ReadOnly, permWerewolf   );
                addPerm(this.guild.id, Perm.RW,       permLiving     );
                addPerm(this.guild.id, Perm.RW,       permLivingVoice);
                addPerm(this.guild.id, Perm.ReadOnly, permDead       );
                addPerm(this.guild.id, Perm.ViewOnly, permDeadVoice  );
                break;
            default:
                assertUnreachable(this.phase);
        }
        if (this.guild.me != null) {
            addPerm(this.guild.me.id, Perm.Admin, permLiving     );
            addPerm(this.guild.me.id, Perm.Admin, permLivingVoice);
            addPerm(this.guild.me.id, Perm.Admin, permDead       );
            addPerm(this.guild.me.id, Perm.Admin, permDeadVoice  );
            addPerm(this.guild.me.id, Perm.Admin, permWerewolf   );
        }
        this.channels.Living     .permissionOverwrites.set(permLiving     );
        this.channels.LivingVoice.permissionOverwrites.set(permLivingVoice);
        this.channels.Dead       .permissionOverwrites.set(permDead       );
        this.channels.DeadVoice  .permissionOverwrites.set(permDeadVoice  );
        this.channels.Werewolf   .permissionOverwrites.set(permWerewolf   );

        const LiveID = this.channels.LivingVoice.id;
        const DeadID = this.channels.DeadVoice.id;
        for(const uid in this.members) {
            const m_old = this.members[uid].member;
            if(m_old == null) continue;
            m_old.fetch().then(m => {
                if(m.voice.channel == null) {
                    m.voice;
                    return;
                }
                let Li = permLivingVoice.findIndex(a => a.id == uid);
                let Di = permDeadVoice.findIndex(a => a.id == uid);
                if(Li < 0) Li = permLivingVoice.findIndex(a => a.id == this.guild.id);
                if(Di < 0) Di = permDeadVoice.findIndex(a => a.id == this.guild.id);
                if(Li < 0) this.err();
                if(Di < 0) this.err();
                if(m.voice.channel.id == LiveID){
                    const allowL = permLivingVoice[Li].allow;
                    if(allowL == RW_alw){
                        m.voice.setMute(false);
                    } else {
                        const allowD = permDeadVoice[Di].allow;
                        if(allowD == null) return;
                        if(allowD == RW_alw){
                            m.voice.setChannel(DeadID);
                            m.voice.setMute(false);
                        } else {
                            m.voice.setMute(true);
                        }
                    }
                } else if(m.voice.channel.id == DeadID){
                    const allowD = permDeadVoice[Di].allow;
                    if(allowD == RW_alw){
                        m.voice.setMute(false);
                    } else  {
                        const allowL = permLivingVoice[Li].allow;
                        if(allowL == null) return;
                        if(allowL == RW_alw){
                            m.voice.setChannel(LiveID);
                            m.voice.setMute(false);
                        } else {
                            m.voice.setMute(true);
                        }
                    }
                } else {
                    m.voice.setMute(false);
                }
            });
        }
        this.channels.LivingVoice.fetch().then(v => {
            v.members.forEach(m => {
                if(m.id in this.members) return;
                if(cu1 != null && m.id == cu1.id) return;
                if(cu2 != null && m.id == cu2.id) return;
                const Li = permLivingVoice.findIndex(a => a.id == this.guild.id);
                if(Li < 0) this.err();
                const allowL = permLivingVoice[Li].allow;
                if(allowL == RW_alw){
                    m.voice.setMute(false);
                } else {
                    m.voice.setChannel(LiveID);
                }
            })
        })
        this.channels.DeadVoice.fetch().then(v => {
            v.members.forEach(m => {
                if(m.id in this.members) return;
                if(cu1 != null && m.id == cu1.id) return;
                if(cu2 != null && m.id == cu2.id) return;
                const Di = permDeadVoice.findIndex(a => a.id == this.guild.id);
                if(Di < 0) this.err();
                const allowD = permDeadVoice[Di].allow;
                if(allowD == RW_alw){
                    m.voice.setMute(false);
                } else if(allowD == ReadOnly_alw){
                    m.voice.setMute(false);
                } else {
                    m.voice.disconnect();
                }
            })
        })
    }    
    resetReactedMember(){
        this.reactedMember = Object.create(null);
    }

    sendFP_Result(uid : string, uch : Discord.TextChannel, tid : string | null, LangFP : FortunePriestType, icon : string){
        if(tid == null || tid == ""){
            uch.send(LangFP.no_result);
        } else{
            const tRole = this.members[tid].role;
            if(tRole == null) return this.err();
            const team = whatTeamFortuneResult(tRole);
            //let fields : Discord.EmbedField[] = [];

            let sameTeamRole = "";
            Object.keys(this.defaultRoles).forEach(r => {
                const role = r as Role
                if(whatTeamFortuneResult(role) == team) {
                    sameTeamRole += this.emoText[role] + this.roleText[role] + "\n";
                }
            })
            this.members[uid].actionLog.push([tid, team]);
            let actionLog = "";
            this.members[uid].actionLog.forEach(p => {
                const icon = ((p[1] == TeamNames.Evil) ? this.langTxt.emo.Werewolf : this.langTxt.emo.Villager);
                actionLog += icon + " " + this.members[p[0]].nickname + "\n";
            });

            const aname = format(LangFP.result_title, {user:this.members[tid].nickname});

            if(team == TeamNames.Evil){
                uch.send({embeds: [{
                    author      : {name : aname, iconURL: icon},
                    color       : this.langTxt.team_color[team],
                    thumbnail   : {url: this.members[tid].user.displayAvatarURL()},
                    title       : format(LangFP.is_wolf, {user : this.members[tid].nickname, emo : this.langTxt.emo.Werewolf}),
                    fields      : [{name : LangFP.same_team_role, value : sameTeamRole, inline : true},
                                   {name : LangFP.log,    value : actionLog, inline : true}]
                }]});
            } else {
                uch.send({embeds: [{
                    author      : {name : aname, iconURL: icon},
                    color       : this.langTxt.team_color[team],
                    thumbnail   : {url: this.members[tid].user.displayAvatarURL()},
                    title       : format(LangFP.no_wolf, {user : this.members[tid].nickname, emo : this.langTxt.emo.Villager}),
                    fields      : [{name : LangFP.same_team_role, value : sameTeamRole, inline : true},
                        {name : LangFP.log,    value : actionLog, inline : true}]
                }]});
            }
        }
    }
    getTimeFormatFromSec(t : number){
        const m = Math.floor(t / 60);
        const s = Math.floor(t - m * 60);
        if(m == 0){
            return format(this.langTxt.sys.time_formatS, {sec : s});
        }
        if(s == 0){
            return format(this.langTxt.sys.time_formatM, {min : m});
        }
        return format(this.langTxt.sys.time_formatMS, {sec : s, min : m});
    }
    async kickMember(uid : string, reason : KickReason) {
        this.members[uid].isLiving = false;
        this.members[uid].livingDays = this.dayNumber;

        // const uch = this.members[uid].uchannel;
        // if(uch == null) return this.err();
        // uch.send(getUserMentionStrFromId(uid) + this.langTxt.sys.dead);
        // this.channels.Living.send(getUserMentionStrFromId(uid) + this.langTxt.sys.dead);
        this.channels.Dead.send({embeds: [{
            title: format(this.langTxt.sys.welcome_dead, {user : this.members[uid].nickname}),
            color: this.langTxt.sys.system_color,
        }]});

        let goodNum = 0;
        let evilNum = 0;

        this.members[uid].deadReason = reason;
        if(reason == KickReason.Vote){
            this.httpGameState.updateMemberDead(uid);
        }
        if(reason == KickReason.Werewolf){
            this.httpGameState.updateMemberKill(uid);
        }
        for(let id in this.members){
            if(!this.members[id].isLiving) continue;
            const r = this.members[id].role;
            if(r == null) return this.err();
            if(r == Role.Werewolf) {
                evilNum += 1;
            } else {
                goodNum += 1;
            }
        }
        if(goodNum <= evilNum){
            this.gameEnd(TeamNames.Evil);
            return;
        }
        if(evilNum == 0){
            this.gameEnd(TeamNames.Good);
            return;
        }

        this.updateRoomsRW();

        if(reason == KickReason.Vote){
            await this.startP6_Night();
        }
    }
    broadcastLivingUserChannel(mess : string | Discord.MessageEmbed){
        for(const uid in this.members){
            if(!this.members[uid].isLiving) continue;
            const uch = this.members[uid].uchannel;
            if(uch == null) continue;
            if (typeof mess === "string") {
                uch.send(mess);
            } else {
                uch.send({embeds: [mess]});
            }
        }
    }
    async voiceChannelsLink(){
        const ret = await this.streams.connectVoice();
        if(ret) {
            this.channels.Living.send(this.langTxt.sys.Link_Voice);
            if(this.streams.bgmFileName == ""){
                this.streams.setBGM(this.srvSetting.music.opening);
            }
        }else{
            this.channels.Living.send(this.langTxt.sys.Link_Voice_Err);
        }
    }
    voiceChannelsUnlink(){
        this.streams.unconnectVoice();
        this.channels.Living.send(this.langTxt.sys.Unlink_Voice);
    }
    stopTimer(ch : Discord.TextChannel){
        if(this.isTimerProgress){
            this.stopTimerRequest = true;
            this.channels.Living.send({embeds: [{
                title: format(this.langTxt.sys.stop_timer, {time : this.getTimeFormatFromSec(this.remTime), cmd : this.langTxt.sys.cmd_resume_timer[0]}),
                color: this.langTxt.sys.system_color,
            }]});
        } else {
            ch.send(this.langTxt.sys.no_timer);
        }
    }
    resumeTimer(ch : Discord.TextChannel){
        if(this.isTimerProgress){
            this.stopTimerRequest = false;
            this.channels.Living.send({embeds: [{
                title: format(this.langTxt.sys.restart_timer, {time : this.getTimeFormatFromSec(this.remTime)}),
                color: this.langTxt.sys.system_color,
            }]});
        } else {
            ch.send(this.langTxt.sys.no_timer);
        }
    }
    ////////////////////////////////////////////
    updateWantedEmb(mes : Discord.Message | null) {
        let message : Discord.Message | null
        if (mes != null) {
            message = mes;
        } else {
            let keys = Object.keys(this.interactControllers[InteractType.Accept]);
            if (keys.length == 0) return;
            if (keys.length >= 2) { 
                this.err();
                return;
            }
            message = this.interactControllers[InteractType.Accept][keys[0]];
        }
        const now_num = Object.keys(this.members).length;
        let   text : string = "";
        Object.keys(this.members).forEach((key, idx) => {
            text += this.members[key].nickname + "\n";
        });
        message.edit({embeds: [{
            title: format(this.langTxt.sys.Current_join_member_num, {num : now_num, max : this.reqMemberNum}),
            description : text,
            color: this.langTxt.sys.system_color,
        }]});
    }

    async joinMemberInteract(interaction : Discord.ButtonInteraction, mes : Discord.Message){
        let send_text : string = "";
        let ng = false;
        if (interaction.member == null)  return;

        // custom_id

        if (typeof interaction.member.permissions === "string") {
            console.error("interaction.member.permissions type err", interaction.member.permissions);
            return;
        }
        if (interaction.member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)){
            this.sendErr(
                this.channels.Living,
                "",
                format(this.langTxt.p1.err_join_admin, {user_m : getUserMentionStr(interaction.user), cmd : this.langTxt.p1.cmd_join_force[0]}));
            ng = true;
        }
        if(!ng){
            const member2 = interaction.member;
            const member = await this.guild.members.fetch(interaction.user.id)
            if(interaction.user.id in this.members){
                send_text += format(this.langTxt.p1.already_in, {user : getNicknameFromMem(member), leave : this.langTxt.p1.cmd_leave[0]});
            } else {
                this.members[interaction.user.id] = new GameMember(member);
                send_text += format(this.langTxt.p1.welcome, {user : getNicknameFromMem(member)});
            }
            this.httpGameState.updateMembers();
            interaction.reply({
                content: send_text,
                ephemeral: true
            });
            this.updateWantedEmb(mes);
        } else {
            interaction.update({}); // do nothing
        }
        const now_num = Object.keys(this.members).length;
        if(now_num == this.reqMemberNum){
            let send_text2 = format(this.langTxt.p1.member_full, {cmd : this.langTxt.p1.cmd_start[0]});
            this.channels.Living.send(send_text2);
        }
    }
    joinMember(message : Discord.Message, force = false){
        let send_text : string = "";
        let ng = false;
        if (message.member == null) return;
        if (message.member != null && message.member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)){
            if(force){
                this.sendWarn(
                    this.channels.Living,
                    "",
                    format(this.langTxt.p1.warn_join_admin, {user_m : getUserMentionStr(message.author)}));
            } else {
                this.sendErr(
                    this.channels.Living,
                    "",
                    format(this.langTxt.p1.err_join_admin, {user_m : getUserMentionStr(message.author), cmd : this.langTxt.p1.cmd_join_force[0]}));
                ng = true;
            }
        }
        if(!ng){
            if(message.author.id in this.members){
                send_text += format(this.langTxt.p1.already_in, {user : getNicknameFromMes(message), leave : this.langTxt.p1.cmd_leave[0]});
            } else {
                this.members[message.author.id] = new GameMember(message.member);
                send_text += format(this.langTxt.p1.welcome, {user : getNicknameFromMes(message)});
            }
            this.httpGameState.updateMembers();
        }
        const now_num = Object.keys(this.members).length;
        send_text += "\n" + format(this.langTxt.p1.current_count, {num : now_num, all : this.reqMemberNum});
        if(now_num == this.reqMemberNum){
            send_text += "\n" + format(this.langTxt.p1.member_full, {cmd : this.langTxt.p1.cmd_start[0]});
        }
        this.channels.Living.send(send_text);
        this.updateWantedEmb(null);
    }
    leaveMember(message : Discord.Message){
        let send_text : string = "";
        if(message.author.id in this.members){
            delete this.members[message.author.id];
            send_text += format(this.langTxt.p1.see_you, {user : getNicknameFromMes(message)});
            this.httpGameState.updateMembers();
        }else{
            send_text += format(this.langTxt.p1.no_join, {user : getNicknameFromMes(message), member_list : this.langTxt.sys.cmd_member_list[0]});
        }
        const now_num = Object.keys(this.members).length;
        send_text += "\n" + format(this.langTxt.p1.current_count, {num : now_num, all : this.reqMemberNum});
        if(now_num == this.reqMemberNum){
            send_text += "\n" + format(this.langTxt.p1.member_full, {cmd : this.langTxt.p1.cmd_start[0]});
        }
        this.channels.Living.send(send_text);
        this.updateWantedEmb(null);
    }
    kickEntryMember(message : Discord.Message){
        let send_text : string = "";
        if(message.mentions.members == null) return;
        for(const mem of message.mentions.members){
            const uid = mem[0];
            if(uid in this.members){
                delete this.members[uid];
                send_text += format(this.langTxt.p1.see_you, {user : getNicknameFromMem(mem[1])});
                this.httpGameState.updateMembers();
            }else{
                send_text += format(this.langTxt.p1.no_join, {user : getNicknameFromMem(mem[1]), member_list : this.langTxt.sys.cmd_member_list[0]});
            }
            send_text += "\n";
        }
        const now_num = Object.keys(this.members).length;
        send_text += "\n" + format(this.langTxt.p1.current_count, {num : now_num, all : this.reqMemberNum});
        if(now_num == this.reqMemberNum){
            send_text += "\n" + format(this.langTxt.p1.member_full, {cmd : this.langTxt.p1.cmd_start[0]});
        }
        this.channels.Living.send(send_text);
        this.updateWantedEmb(null);
    }
    async checkStartGame(message : Discord.Message){
        const now_num = Object.keys(this.members).length;
        if(now_num < this.reqMemberNum){
            this.channels.Living.send(format(this.langTxt.p1.member_not_enough, {num : now_num, rem : this.reqMemberNum- now_num}));
            return;            
        }
        if(now_num > this.reqMemberNum){
            this.channels.Living.send(format(this.langTxt.p1.member_over, {num : now_num, over : now_num - this.reqMemberNum}));
            return;            
        }
        await this.gamePreparation(message);
    }
    async resetGame(){
        this.reset();
        await this.start_1Wanted();
        this.sendMemberList(this.channels.Living);

        const now_num = Object.keys(this.members).length;
        let send_text = format(this.langTxt.p1.current_count, {num : now_num, all : this.reqMemberNum});
        if(now_num == this.reqMemberNum){
            send_text += "\n" + format(this.langTxt.p1.member_full, {cmd : this.langTxt.p1.cmd_start[0]});
        }
        this.channels.Living.send(send_text);

        for(const mid in this.members){
            this.members[mid].isLiving = true;
        }
        this.httpGameState.updateMembers();
    }
    ////////////////////////////////////////////
    // Phase.p2_Preparation
    ////////////////////////////////////////////
    async gamePreparation(message : Discord.Message){
        this.phase = Phase.p2_Preparation;
        this.dayNumber = 0;
        this.interactControllers[InteractType.Accept] = Object.create(null);
        this.channels.Living.send(this.langTxt.p2.start_preparations);
        this.sendWantNums(this.channels.Living);
        this.sendMemberList(this.channels.Living);
        this.sendWantNums(this.channels.GameLog);
        this.sendMemberList(this.channels.GameLog);
        this.sendMemberList(this.channels.Dead);
        await this.searchUserChannel(message);
        this.streams.setBGM(this.srvSetting.music.first_night);
        this.httpGameState.updatePhase(this.langTxt.p2.phase_name);

        this.updateRoomsRW();

        if(this.ruleSetting.wish_role_time <= 0){
            await this.gamePreparation2();
        } else {
            this.interactControllers[InteractType.WishRole] = Object.create(null);

            this.channels.Living.send({embeds: [{
                title       : format(this.langTxt.p2.wish_role_preparations, {sec : this.ruleSetting.wish_role_time}),
                description : this.langTxt.p2.wish_role_desc2 + "\n" + format(this.langTxt.p2.wish_role_desc3, {n : this.ruleSetting.wish_role_rand_weight}),
                color       : this.langTxt.sys.system_color,
            }]});
            
            let rolesTxt = "";
            for(const r in this.defaultRoles){
                if(this.defaultRoles[r] <= 0) continue;
                rolesTxt += this.langTxt.role_uni[r as Role] + " " + this.langTxt.role[r as Role] + "\n";
            }

            const embed = new Discord.MessageEmbed({
                title       : format(this.langTxt.p2.wish_role_desc1, {sec : this.ruleSetting.wish_role_time}),
                description : this.langTxt.p2.wish_role_desc2 + "\n\n" + rolesTxt,
                color       : this.langTxt.sys.system_color,
            });
            for(const uid in this.members){
                this.members[uid].wishRole = Object.create(null);
                for(const r in this.defaultRoles){
                    if(this.defaultRoles[r] <= 0) continue;
                    this.members[uid].wishRole[r]    = 3;
                }
                const uch = this.members[uid].uchannel;
                if (uch  == null) continue;

                const buttons_arr : Discord.MessageActionRow[] = [];
                for(const r in this.defaultRoles){
                    buttons_arr.push(this.makeWishRoleButtons(uid, r as Role));
                }
                const components_arr = Util.arrange_components(buttons_arr);
                for (let i = 0; i < components_arr.length; ++i) {
                    let sent_message;
                    if (i == 0) {
                        sent_message = await uch.send({embeds: [embed], components : components_arr[i]});
                    } else {
                        sent_message = await uch.send({components : components_arr[i]});
                    }
                    this.interactControllers[InteractType.WishRole][sent_message.id] = sent_message;
                }
            }
            this.remTime = this.ruleSetting.wish_role_time;
            gameTimer(this.gameId, this, Phase.p2_Preparation, [], dummy_gamePreparation2);
        }
    }
    makeWishRoleButtons (uid : string, r : Role) {
        const col = new Discord.MessageActionRow();
        const runi = this.langTxt.role_uni[r];
        const now = this.members[uid].wishRole[r];
        for(let i = 1; i <= 5; ++i) {
            if (i == now) {
                col.addComponents(Util.make_button(i + "_" + r, this.langTxt.role[r as Role] + runi, {style : "green", emoji : this.langTxt.react.num[i]}));
            } else {
                col.addComponents(Util.make_button(i + "_" + r, runi, {style : "black", emoji : this.langTxt.react.num[i]}));
            }
        }
        return col;
    }
    wishRoleCheck(interaction : Discord.ButtonInteraction){
        const value = parseInt(interaction.customId[0]);
        if (value < 1 || value > 5) return;
        const roleStr = interaction.customId.substring(2);
        const roleName= Object.keys(this.defaultRoles).find(role => role == roleStr) as Role | null;
        if(roleName == null) return;
        
        this.members[interaction.user.id].wishRole[roleName] = value;
        if (interaction.message.type != "DEFAULT" ) return;

        const components = interaction.message.components;
        const new_buttons = this.makeWishRoleButtons(interaction.user.id, roleName);
        for (let i = 0; i < components.length; ++i) {
            if (components[i].components[0].customId === "1_" + roleStr) {
                components[i] = new_buttons;
                break;
            }
        }
        interaction.update({components : components});
    }

    // http://www.prefield.com/algorithm/math/hungarian.html
    hungarian(mat : number[][]) {
        const n = mat.length;
        const inf = 1e9;
        let fx =  new Array<number>(n).fill(inf);
        let fy =  new Array<number>(n).fill(0);
        let x =  new Array<number>(n).fill(-1);
        let y =  new Array<number>(n).fill(-1);
        for (let i = 0; i < n; ++i) {
            for (let j = 0; j < n; ++j) {
                fx[i] = Math.max(fx[i], mat[i][j]);
            }
        }
        for (let i = 0; i < n; ) {
            let t =  new Array<number>(n).fill(-1);
            let s =  new Array<number>(n+1).fill(i);
            let q = 0;
            for (let p = 0; p <= q && x[i] < 0; ++p) {
                for (let k = s[p], j = 0; j < n && x[i] < 0; ++j) {
                    if (fx[k] + fy[j] != mat[k][j] || t[j] >= 0) continue;
                    s[++q] = y[j];
                    t[j] = k;
                    if (s[q] >= 0) continue;
                    for (p = j; p >= 0; j = p) {
                        y[j] = k = t[j];
                        p = x[k];
                        x[k] = j;
                    }
                }
            }
            if (x[i] < 0) {
                let d = inf;
                for (let k = 0; k <= q; ++k) {
                    for (let j = 0; j < n; ++j) {
                        if (t[j] >= 0) continue;
                        d = Math.min(d, fx[s[k]] + fy[j] - mat[s[k]][j]);
                    }
                }
                for (let j = 0; j < n; ++j) {
                    fy[j] += (t[j] < 0 ? 0 : d);
                }
                for (let k = 0; k <= q; ++k) {
                    fx[s[k]] -= d;
                }
            } else {
                ++i;
            }
        }
        return x;
    }
    async gamePreparation2() {

        const enable_confirmation = (this.ruleSetting.wish_role_time <= 0);
        let role_arr : Role[] = [];
        if(this.ruleSetting.wish_role_time <= 0){
            for(const r in this.defaultRoles){
                for(let i = 0; i < this.defaultRoles[r]; ++i){
                    role_arr.push(r as Role);
                }
            }
            console.log(role_arr);
            role_arr = shuffle(role_arr);
        }else{
            this.interactControllers[InteractType.WishRole] = Object.create(null);

            const members = shuffle(Object.keys(this.members));
            let mat : number[][] = new Array<number[]>(members.length);
            let roles : Role[] = [];
            for(const r in this.defaultRoles){
                for(let i = 0; i < this.defaultRoles[r]; ++i){
                    roles.push(r as Role);
                }
            }
            roles = shuffle(roles);
            const scale = 100000;
            for(let i = 0; i < members.length; ++i){
                mat[i] = [];
                const uid = members[i];
                for(let j = 0; j < roles.length; ++j){
                    const r = roles[j];
                    const score =
                        Math.floor(Math.random() * this.ruleSetting.wish_role_rand_weight * scale)
                        + scale * this.members[uid].wishRole[r];
                    mat[i].push(score);
                }
            }
            // console.log(mat);
            const res = this.hungarian(mat);
            // console.log(res);
            Object.keys(this.members).forEach((uid, idx)=>{
                for(let i = 0; i < members.length; ++i){
                    if(uid == members[i]){
                        role_arr[idx] = roles[res[i]];
                    }
                }
            });
        }

        let WerewolfRoomField : Discord.EmbedField = {name : this.langTxt.p2.mate_names_title, value : "", inline : true};
        let WerewolfNames     = "";

        let MasonField : Discord.EmbedField = {name : this.langTxt.p2.mate_names_title, value : "", inline : true};

        Object.keys(this.members).forEach((uid, i)=>{
            const r = role_arr[i];
            this.members[uid].role = r;
            const allowWolfRoom = (r == Role.Werewolf || r == Role.Communicatable);
            this.members[uid].alpStr = this.langTxt.react.alp[i];
            this.members[uid].allowWolfRoom = allowWolfRoom;
            if(allowWolfRoom){
                WerewolfRoomField.value += this.members[uid].nickname + " (" + this.langTxt.role[r]+ ")\n";
                WerewolfNames += this.members[uid].nickname + " ";
            }
            if(r == Role.Mason) {
                MasonField.value += this.members[uid].nickname + "\n";
            }
        });

        this.resetReactedMember();
        this.p2CanForceStartGame = false;
        Object.keys(this.members).forEach(async uid => {
            if(!(uid in this.members)) return this.err();
            const uch = this.members[uid].uchannel;
            if(uch == null) return this.err();

            const role_str = this.members[uid].role;
            if(role_str == null) return this.err();
            const team = getDefaultTeams(role_str);
            let fields : Discord.EmbedField[] = [];
            if(this.members[uid].allowWolfRoom){
                fields.push(WerewolfRoomField);
            }
            if(this.members[uid].role == Role.Mason) {
                fields.push(MasonField);
            }
            const embed = new Discord.MessageEmbed({
                title       : format(this.langTxt.p2.announce_role, {role : this.langTxt.role[role_str], team : this.langTxt.team_name[team]}),
                description : this.langTxt.role_descs[role_str],
                color       : this.langTxt.team_color[team],
                thumbnail   : {url: this.langTxt.role_img[role_str]},
                fields      : fields,
                author      : {name: this.members[uid].nickname, iconURL: this.members[uid].user.displayAvatarURL()},
            });
            uch.send({embeds: [embed]});
            if(enable_confirmation){
                const sent_message = await uch.send({
                    content : getUserMentionStr(this.members[uid].user) + " " + this.langTxt.p2.announce_next,
                    components : [new Discord.MessageActionRow().addComponents(Util.make_button("accept", this.langTxt.react.o, {style : "black"}))]
                });
                this.interactControllers[InteractType.Accept][sent_message.id] = sent_message;
            }
        });
        { // for Werewolf
            const role_str = Role.Werewolf;
            const team = getDefaultTeams(role_str);
            const embed = new Discord.MessageEmbed({
                title       : format(this.langTxt.werewolf.start_room_title, {names : WerewolfNames}),
                description : this.langTxt.role_descs[role_str],
                color       : this.langTxt.team_color[team],
                thumbnail   : {url: this.langTxt.role_img[role_str]},
                fields      : [WerewolfRoomField],
            });
            this.channels.Werewolf.send({embeds: [embed]});
        }
        if(enable_confirmation){
            this.channels.Living.send({embeds:[{
                title       : format(this.langTxt.p2.done_preparations, {sec : this.ruleSetting.confirmation_sec}),
                color       : this.langTxt.sys.system_color,
            }]});
            this.timerList.push(setTimeout(this.checkAcceptTimeout, this.ruleSetting.confirmation_sec *1000, this.gameId, this));
        } else {
            this.startFirstNight();
        }
    }

    getUserChanncelName(uname : string){
        return format(this.langTxt.sys.user_room_name, {user : uname}).toLowerCase().replace(/[\s\(\)\{\}\\\/\[\]\*\+\.\?\^\$\|!"#%&'=~`<>@[;:,]/g, '');
    }
    async searchUserChannel(message : Discord.Message){
        if(message.guild == null) return this.err();

        const keys = Object.keys(this.members);
        await Promise.all(keys.map(async uid => {
            //const uid : string = keys[idx];
            if(message.guild == null) return this.err();
            if(!(uid in this.members)) return;
            //if(!(uid in this.members)) return this.err();
            const user = this.members[uid].user;
            const ch_name = this.getUserChanncelName(this.members[uid].nickname);

            let perm : Discord.OverwriteResolvable[] = [];
            perm.push({id: message.guild.id, allow: NoAccess_alw, deny:  NoAccess_dny});
            message.guild.members.cache.forEach(m => {
                if ((this.clients[0].user != null && m.id === this.clients[0].user.id)||
                    (this.clients[1].user != null && m.id === this.clients[1].user.id)){
                    perm.push({id: m.id, allow: Admin_alw, deny:  Admin_dny});
                } else if (m.id === uid){
                    perm.push({id: m.id, allow: RW_alw, deny:  RW_dny});
                }
            });
            const guild = message.guild;
            let user_ch = guild.channels.cache.find(c => {
                return c.name == ch_name && c.type === 'GUILD_TEXT' && c.parentId == this.parentID;
            }) as Discord.TextChannel | null;

            let g2 : Discord.Guild | null = null;
            if(user_ch != null){
                console.log("Found ", user.username, " channnel", user_ch.id);
                user_ch.permissionOverwrites.set(perm);
                g2 = this.guild2;
            } else {
                user_ch = await message.guild.channels.create(ch_name, {parent : this.parentID, type : 'GUILD_TEXT', position : 1, permissionOverwrites:perm});
                console.log("New ", user.username, " channnel", user_ch.id);
                g2 = await this.guild2.fetch();
            }
            if(user_ch == null) return this.err();
            if(g2 == null) return this.err();

            let user_ch2 = g2.channels.cache.find(c => {
                return c.name == ch_name && c.type === 'GUILD_TEXT' && c.parentId == this.parentID;
            }) as Discord.TextChannel | null;
            if(user_ch2 == null) return this.err();

            this.members[uid].uchannel  = user_ch;
            this.members[uid].uchannel2 = user_ch2;
        }));
        return true;
    }
    preparationAccept(uid : string, interaction : Discord.ButtonInteraction | null){
        if(Object.keys(this.members).find(k => k == uid) == null) return;
        if(Object.keys(this.reactedMember).find(u => u == uid) != null){
            if (interaction != null) {
                interaction.reply(this.langTxt.p2.already_ac);
            } else {
                const uch = this.members[uid].uchannel;
                if (uch) uch.send(this.langTxt.p2.already_ac);
            }
            return;
        }
        if (interaction != null) {
            interaction.reply(format(this.langTxt.p2.new_accept, {user : this.members[uid].nickname}));
        } else {
            const uch = this.members[uid].uchannel;
            if (uch) uch.send(format(this.langTxt.p2.new_accept, {user : this.members[uid].nickname}));
        }
        this.reactedMember[uid] = 1;
        if(Object.keys(this.reactedMember).length == Object.keys(this.members).length){
            this.channels.Living.send(this.langTxt.p2.all_accept);
            this.startFirstNight();
        }
    }
    checkAcceptTimeout(gid : number, obj : GameState){
        if(gid != obj.gameId) return;
        if(obj.phase != Phase.p2_Preparation) return;
        let non_ac_users = "";
        Object.keys(obj.members).forEach(uid =>{
            if(Object.keys(obj.reactedMember).find(u => u == uid) == null){
                non_ac_users += getUserMentionStrFromId(uid)+ " ";
            }
        })
        obj.channels.Living.send(format(obj.langTxt.p2.incomplete_ac, {users:non_ac_users, cmd:obj.langTxt.p2.cmd_start_force[0]}));
        obj.p2CanForceStartGame = true;
    }
    forceStartGame(){
        if(this.p2CanForceStartGame){
            this.p2CanForceStartGame = false;
            this.channels.Living.send(this.langTxt.p2.force_start);
            this.startFirstNight();
        }else{
            this.channels.Living.send(format(this.langTxt.p2.cant_force_start, {sec : this.ruleSetting.confirmation_sec}));
        }
    }

    ////////////////////////////////////////////
    // Phase.p3_FirstNight
    ////////////////////////////////////////////
    startFirstNight(){
        this.phase = Phase.p3_FirstNight;
        this.remTime = this.ruleSetting.first_night.first_night_time;
        this.updateRoomsRW();
        this.interactControllers[InteractType.Accept] = Object.create(null);
        for(let my_id in this.members){
            const uch = this.members[my_id].uchannel;
            if(uch == null) return this.err();
            if(this.members[my_id].role == Role.Seer){
                if(this.ruleSetting.first_nights_fortune === 'no_fortune'){
                    uch.send(getUserMentionStrFromId(my_id) + this.langTxt.p3.no_fortune);
                }else if(this.ruleSetting.first_nights_fortune === 'random'){
                    let ulist : string[] = Object.keys(this.members).filter( tid =>{
                        return tid != my_id;
                    })
                    uch.send(getUserMentionStrFromId(my_id) + this.langTxt.p3.random_fortune);
                    if(ulist.length == 0){
                        this.sendFP_Result(my_id, uch, null, this.langTxt.fortune, this.langTxt.role_img.Seer);
                    } else{
                        this.sendFP_Result(my_id, uch, ulist[Math.floor(Math.random()*ulist.length)], this.langTxt.fortune, this.langTxt.role_img.Seer);
                    }
                }else if(this.ruleSetting.first_nights_fortune === 'random_white'){
                    let ulist : string[] = Object.keys(this.members).filter( tid =>{
                        if(tid == my_id) return false;
                        const tRole = this.members[tid].role;
                        if(tRole == null) return this.err();
                        return whatTeamFortuneResult(tRole) != TeamNames.Evil;
                    })
                    uch.send(getUserMentionStrFromId(my_id) + this.langTxt.p3.random_white_fortune);
                    if(ulist.length == 0){
                        this.sendFP_Result(my_id, uch, null, this.langTxt.fortune, this.langTxt.role_img.Seer);
                    } else{
                        this.sendFP_Result(my_id, uch, ulist[Math.floor(Math.random()*ulist.length)], this.langTxt.fortune, this.langTxt.role_img.Seer);
                    }
                //}else if(this.ruleSetting.first_nights_fortune === 'no_limit'){
                }else{
                    assertUnreachable(this.ruleSetting.first_nights_fortune);
                }
            }
        }
        this.killNext = [];
        this.channels.Living.send({embeds:[{
            title       : format(this.langTxt.p3.length_of_the_first_night, {time : this.getTimeFormatFromSec(this.remTime)}),
            color       : this.langTxt.sys.system_color,
        }]});
        this.httpGameState.updatePhase(this.langTxt.p3.phase_name);
        this.stopTimerRequest = false;
        gameTimer(this.gameId, this, Phase.p3_FirstNight, this.ruleSetting.first_night.alert_times, dummy_startP4Daytime);
    }
    ////////////////////////////////////////////
    // Phase.p4_Daytime
    ////////////////////////////////////////////
    async startP4_Daytime(){
        this.phase = Phase.p4_Daytime;
        this.dayNumber += 1;
        this.updateRoomsRW();
        this.streams.setBGM(this.srvSetting.music.day_time);
        let living     : string = "";
        let living_num : number = 0;
        for(const uid in this.members){
            this.members[uid].validVoteID = [];
            if(this.members[uid].isLiving){
                living += this.members[uid].nickname + "\n";
                living_num += 1;
            }
        }
        
        if(this.killNext.length === 1){
            const p = this.killNext[0];
            const uid = p[0];
            const uname = this.members[uid].nickname;
            const thumb = this.members[uid].user.displayAvatarURL();
            const embed = new Discord.MessageEmbed({
                author    : {name: format(this.langTxt.p4.day_number, {n : this.dayNumber})},
                title     : format(this.langTxt.p4.killed_morning, {user : uname}),
                color     : this.langTxt.sys.killed_color,
                thumbnail : {url: thumb},
                fields    : [{name : format(this.langTxt.p4.living_and_num, {n : living_num}), value: living, inline : true}]
            });
            this.channels.Living.send({embeds: [embed]});
            this.channels.GameLog.send({embeds: [embed]});
        } else if(this.killNext.length === 0){
            const embed = new Discord.MessageEmbed({
                author    : {name: format(this.langTxt.p4.day_number, {n : this.dayNumber})},
                title     : this.langTxt.p4.no_killed_morning,
                color     : this.langTxt.sys.no_killed_color,
                fields    : [{name : format(this.langTxt.p4.living_and_num, {n : living_num}), value: living, inline : true}]
            });
            this.channels.Living.send({embeds: [embed]});
            this.channels.GameLog.send({embeds: [embed]});
        } else {
            // 未実装
        }
        this.killNext    = [];

        if(this.defaultRoles[Role.Baker] > 0){
            if(Object.keys(this.members).some(uid => this.members[uid].isLiving && this.members[uid].role == Role.Baker)){
                const bread = this.langTxt.baker.repertoire[Math.floor(Math.random() * this.langTxt.baker.repertoire.length)];
                const embed = new Discord.MessageEmbed({
                    author    : {name: this.langTxt.role.Baker, iconURL: this.langTxt.role_img.Baker},
                    title     : format(this.langTxt.baker.deliver, {bread : bread}),
                    color     : this.langTxt.team_color.Good,
                });
                this.channels.Living.send({embeds: [embed]});
            } else if(Object.keys(this.members).some(uid => this.members[uid].livingDays == this.dayNumber-1 && this.members[uid].role == Role.Baker)){
                const embed = new Discord.MessageEmbed({
                    author    : {name: this.langTxt.role.Baker, iconURL: this.langTxt.role_img.Baker},
                    title     : this.langTxt.baker.killed,
                    color     : this.langTxt.sys.killed_color,
                });
                this.channels.Living.send({embeds: [embed]});
            }
        }

        this.remTime = Math.max(0, this.ruleSetting.day.day_time - this.ruleSetting.day.reduction_time * (this.dayNumber - 1));
        // this.channels.Living.send(format(this.langTxt.p4.length_of_the_day, {time : this.getTimeFormatFromSec(this.remTime)}));
        this.channels.Living.send({embeds:[{
            title       : format(this.langTxt.p4.length_of_the_day, {time : this.getTimeFormatFromSec(this.remTime)}),
            color       : this.langTxt.sys.system_color,
        }]});
        this.daytimeStartTime = Date.now();
        await this.makeCoCallController();
        await this.makeDictatorController();
        this.voteNum     = 0;
        this.runoffNum   = 0;
        this.stopTimerRequest = false;
        
        this.httpGameState.updatePhase(format(this.langTxt.p4.phase_name, {n : this.dayNumber}));
        gameTimer(this.gameId, this, Phase.p4_Daytime, this.ruleSetting.day.alert_times, dummy_startP5Vote);
    }
    async makeCoCallController(){
        this.interactControllers[InteractType.CO_Call] = Object.create(null);
        this.cutTimeMember = Object.create(null);

        let CO_buttons    : Discord.MessageButton[] = [];
        let White_buttons : Discord.MessageButton[] = [];
        let Black_buttons : Discord.MessageButton[] = [];

        for(const r in this.defaultRoles) {
            const role = r as Role
            CO_buttons.push(Util.make_button(role, this.roleText[role], {style : "blue", emoji : this.langTxt.role_uni[role]}));
        }
        let liveNum = 0;
        for(const uid in this.members){
            White_buttons.push(Util.make_button("white_" + uid, this.members[uid].nickname, {style : "green"}));
            Black_buttons.push(Util.make_button("black_" + uid, this.members[uid].nickname, {style : "black"}));
            if (this.members[uid].isLiving) liveNum++;
        }
        const components_arr = Util.arrange_components([
            ...Util.arrange_buttons(CO_buttons   ),
            ...Util.arrange_buttons(White_buttons),
            ...Util.arrange_buttons(Black_buttons),
            new Discord.MessageActionRow().addComponents(Util.make_button("cut_time", this.langTxt.p4.cut_time_label, {style : "red"}))
        ]);
        const req 
            = (this.ruleSetting.day.cut_time == "all" ?     liveNum
            : this.ruleSetting.day.cut_time == "majority" ? Math.floor(liveNum/2)+1
            : assertUnreachable(this.ruleSetting.day.cut_time));
        const txt = format(this.langTxt.p4.co_call_cuttime_desc, {req : req});

        for(const uid in this.members){
            if(!this.members[uid].isLiving) continue;
            const uch = this.members[uid].uchannel;
            if (uch == null) continue;
            for(let i = 0; i < components_arr.length; i++) {
                let sent_message;
                if (i == 0) {
                    sent_message = await uch.send({
                        embeds: [new Discord.MessageEmbed({
                            title       : this.langTxt.p4.co_call_cuttime_title,
                            color       : this.langTxt.sys.system_color,
                            description : txt,
                        })],
                        components: components_arr[i]
                    });
                } else {
                    sent_message = await uch.send({components: components_arr[i]});
                }
                this.interactControllers[InteractType.CO_Call][sent_message.id] = sent_message;
            }
        }
    }
    async makeDictatorController(){
        if(this.defaultRoles[Role.Dictator] <= 0) return;
        this.interactControllers[InteractType.Dictator] = Object.create(null);

        this.dictatorVoteMode = "";
        for(const uid in this.members){
            if(!this.members[uid].isLiving) continue;
            if(this.members[uid].role != Role.Dictator) continue;
            if(this.members[uid].roleCmdInvokeNum > 0) continue;
            const uch  = this.members[uid].uchannel;
            if(uch == null) continue;
            const embed= new Discord.MessageEmbed({
                author      : {name: this.langTxt.dictator.button_title, iconURL: this.langTxt.role_img.Dictator},
                title       : this.langTxt.dictator.button_desc,
                color       : this.langTxt.sys.killed_color,
            });
            const components = [
                new Discord.MessageActionRow().addComponents(Util.make_button("dictator", this.langTxt.dictator.uni, {style : "red"}))
            ];

            const sent_message = await uch.send({embeds:[embed], components:components});
            this.interactControllers[InteractType.Dictator][sent_message.id] = sent_message;
        }
    }
    makeCoCallLogFields(){
        let callLogs : [string, number, string, string][] = []; // role, time, author, data
        let coLogs   : [number, string][] = []; // time, data
        for(const uid in this.members){
            const ctime = this.members[uid].firstCallCoTime;
            if(ctime == null) continue;
            const role = this.members[uid].coRole;
            if(role == null){
                coLogs.push([ctime, this.langTxt.team_emo.Unknown + " " + this.members[uid].nickname]);
            } else {
                coLogs.push([ctime, this.langTxt.emo[role] + " " + this.members[uid].nickname]);
            }
            if(this.members[uid].callLog.length != 0){
                const author = (role ? this.langTxt.emo[role] : this.langTxt.team_emo.Unknown) + this.members[uid].nickname;
                let dat = "";
                for(const p of this.members[uid].callLog){
                    dat += this.langTxt.team_emo[p[1] ? "Black" : "White"] + " "+ this.members[p[0]].nickname + "\n";
                }
                const r0 = (role == null ? "" : role == Role.Seer ? "0" : role == Role.Priest ? "1" : role);
                callLogs.push([r0, ctime, author, dat]);
            }
        }
        callLogs.sort();
        coLogs.sort();
        let fields : Discord.EmbedField[] = [];
        for(const p of callLogs){
            fields.push({inline : true, name : p[2], value:p[3]});
        }
        if(coLogs.length > 0) {
            let dat = "";
            for(const p of coLogs){
                dat += p[1] + "\n";
            }
            fields.push({inline : true, name : this.langTxt.p4.publish_order, value:dat});
        }
        return fields;
    }
    call_co_cuttime_CheckInteract(interaction : Discord.ButtonInteraction) {
        const uid = interaction.user.id;
        const uch = this.members[uid].uchannel;
        if(uch == null) return this.err();

        if (interaction.customId == "cut_time") {
            const isAdd = true; // TODO
            const liveNum =  Object.keys(this.members).reduce((acc, value) => { return acc + (this.members[value].isLiving?1:0);}, 0);
            const req = (this.ruleSetting.day.cut_time == "all" ?      liveNum
                        :this.ruleSetting.day.cut_time == "majority" ? Math.floor(liveNum/2)+1
                        :assertUnreachable(this.ruleSetting.day.cut_time));
            if(!isAdd){
                delete this.cutTimeMember[uid];
                const now = Object.keys(this.cutTimeMember).length;
                const txt = format(this.langTxt.p4.cut_time_cancel, {now : now, req : req});
                interaction.reply(txt);
                this.channels.Living.send(txt);
            } else {
                this.cutTimeMember[uid] = 1;
                const now = Object.keys(this.cutTimeMember).length;
                const txt = format(this.langTxt.p4.cut_time_accept, {now : now, req : req});
                interaction.reply(txt);
                this.channels.Living.send(txt);
                if(now >= req) {
                    this.channels.Living.send(this.langTxt.p4.cut_time_approved);
                    this.remTime = Math.min(12, this.remTime);
                }
            }
            return;
        }

        let embed : Discord.MessageEmbed | null = null;
        const isWhiteInteract = interaction.customId.startsWith("white_");
        if (isWhiteInteract || interaction.customId.startsWith("black_")) {
            const tid = interaction.customId.substring(6);
            if (!(tid in this.members)) return;

            if(this.members[uid].firstCallCoTime == null){
                this.members[uid].firstCallCoTime = Date.now();
            }
            const tname = this.members[tid].nickname

            const newLog = this.members[uid].callLog.filter(p => p[0] != tid);
            if (this.members[uid].callLog.find(p => p[0] == tid && p[1] == !isWhiteInteract) != null) { // same : cancel
                embed = new Discord.MessageEmbed({
                    author      : {name: this.members[uid].nickname, iconURL: this.members[uid].avatar},
                    title       : format(isWhiteInteract ? this.langTxt.p4.call_white_cancel_title : this.langTxt.p4.call_black_cancel_title, {name : this.members[uid].nickname, trgt:tname}),
                    thumbnail   : {url: this.members[tid].avatar},
                    color       : isWhiteInteract ? this.langTxt.team_color.Good : this.langTxt.team_color.Evil,
                });
            } else {
                newLog.push([tid, !isWhiteInteract]);
                if(isWhiteInteract){
                    embed = new Discord.MessageEmbed({
                        author      : {name: this.members[uid].nickname, iconURL: this.members[uid].avatar},
                        title       : format(this.langTxt.p4.call_white_open_title, {name : this.members[uid].nickname, trgt:tname}),
                        thumbnail   : {url: this.members[tid].avatar},
                        color       : this.langTxt.team_color.Good,
                    });
                } else {
                    embed = new Discord.MessageEmbed({
                        author      : {name: this.members[uid].nickname, iconURL: this.members[uid].avatar},
                        title       : format(this.langTxt.p4.call_black_open_title, {name : this.members[uid].nickname, trgt:tname}),
                        thumbnail   : {url: this.members[tid].avatar},
                        color       : this.langTxt.team_color.Evil,
                    });
                }
            }
            this.members[uid].callLog = newLog;
            this.streams.playSe(this.srvSetting.se.call);
        } else { // CO
            const roleName= Object.keys(this.defaultRoles).find(role => role == interaction.customId) as Role | null;
            if(roleName == null) return;
            if(this.members[uid].firstCallCoTime == null){
                this.members[uid].firstCallCoTime = Date.now();
            }
            this.members[uid].coRole = roleName;
            embed = new Discord.MessageEmbed({
                author      : {name: this.members[uid].nickname, iconURL: this.members[uid].avatar},
                title       : format(this.langTxt.p4.coming_out_open_title, {name : this.members[uid].nickname, role:this.langTxt.role[roleName]}),
                thumbnail   : {url: this.langTxt.role_img[roleName]},
                color       : this.langTxt.sys.system_color,
            });
            this.streams.playSe(this.srvSetting.se.co);
        }
        if(embed == null) return;
        interaction.update({});
        const time = ((Date.now() - this.daytimeStartTime)/1000).toFixed(2);
        embed.description = format(this.langTxt.p4.call_time, {sec : time});
        embed.fields = this.makeCoCallLogFields();

        this.channels.Living.send({embeds:[embed]});
        this.channels.GameLog.send({embeds:[embed]});
        this.httpGameState.updateMembers();
    }
    async dictatorCheck(interaction : Discord.ButtonInteraction) {
        const uch  = this.members[interaction.user.id].uchannel;
        if(uch == null) return;
        this.members[interaction.user.id].roleCmdInvokeNum++;
        const embed= new Discord.MessageEmbed({
            author      : {name: this.langTxt.role.Dictator, iconURL: this.langTxt.role_img.Dictator},
            title       : this.langTxt.dictator.exercise,
            color       : this.langTxt.sys.killed_color,
        });
        for(const uid in this.members){
            if(!this.members[uid].isLiving) continue;
            const uch = this.members[uid].uchannel;
            if(uch == null) continue;
            uch.send({embeds:[embed]});
        }
        this.channels.Living.send({embeds:[embed]});
        this.dictatorVoteMode = interaction.user.id;
        await this.startP5_Vote();
    }

    ////////////////////////////////////////////
    // Phase.p5_Vote
    ////////////////////////////////////////////
    async startP5_Vote(){
        //! no use "this."
        if(this.voteNum === 0){
            this.channels.Living.send({embeds:[{
                title       : format(this.langTxt.p5.end_daytime, {time : this.getTimeFormatFromSec(this.ruleSetting.vote.length)}),
                color       : this.langTxt.sys.system_color,
            }]});
        }
        this.interactControllers[InteractType.CO_Call] = Object.create(null);
        this.interactControllers[InteractType.Dictator] = Object.create(null);
        this.cutTimeMember = Object.create(null);

        if(this.phase != Phase.p5_Vote){
            this.streams.setBGM(this.srvSetting.music.vote);
        }
        this.phase = Phase.p5_Vote;
        this.httpGameState.updatePhase(format(this.langTxt.p5.phase_name, {n : this.dayNumber}));
        this.updateRoomsRW();

        for(const uid in this.members){
            if(!this.members[uid].isLiving) continue;
            const uch = this.members[uid].uchannel;
            if(uch == null) return this.err();
            this.members[uid].voteTo = "";
            if(this.dictatorVoteMode != "" && this.dictatorVoteMode != uid) continue;
            
            for(const tid in this.members){
                if(tid == uid) continue;
                if(!this.members[tid].isLiving) continue;
                this.members[uid].validVoteID.push(tid);
            }
        }
        {
            const ti = (this.voteNum == 0 ? "" : format(this.langTxt.p5.revote_times, {m : this.voteNum+1}));

            let buttons : Discord.MessageButton[] = [];
            for(const tid in this.members){
                if(!this.members[tid].isLiving) continue;
                buttons.push(Util.make_button(tid, this.members[tid].nickname, {style : "black"}));
            }
            const components = Util.arrange_buttons(buttons);
            const embed = new Discord.MessageEmbed({
                title       : format(this.langTxt.p5.vote_title, {n : this.dayNumber, time : ti}),
                color       : this.langTxt.sys.system_color,
            });
            const sent_message = await this.channels.Living.send({
                embeds: [embed],
                components: components
            });
            this.interactControllers[InteractType.Vote][sent_message.id] = sent_message;
        }
        this.remTime = this.ruleSetting.vote.length;
        this.stopTimerRequest = false;
        gameTimer(this.gameId, this, Phase.p5_Vote, this.ruleSetting.vote.alert_times, dummy_voteTimeup);
    }
    
    async voteTimeup(){
        this.interactControllers[InteractType.Vote] = Object.create(null);
    
        let cnt : {[key: string]: number} = Object.create(null);
        for(const uid in this.members){ 
            cnt[uid] = 0;
        }
        let max_cnt = 0;
        let max_uid : string[] = [];
        for(const uid in this.members){ 
            if(!this.members[uid].isLiving) continue;
            if(this.members[uid].voteTo == "") continue;
            const n = cnt[this.members[uid].voteTo] + 1;
            cnt[this.members[uid].voteTo] = n;
            if(max_cnt < n){
                max_cnt = n;
            }
        }
        let living_num = 0;
        for(const uid in this.members){ 
            if(!this.members[uid].isLiving) continue;
            living_num += 1;
            const n = cnt[uid];
            if(n == max_cnt){
                max_uid.push(uid);
            }
        }
    
        const open = (this.ruleSetting.vote.place == 'realtime_anonym_open' || 
                      this.ruleSetting.vote.place == 'after_open' ||
                      this.ruleSetting.vote.place == 'realtime_open');
    
        let desc : string = "";
        if(this.ruleSetting.vote.place == 'no_open'){
            desc = this.langTxt.p5.after_no_open;
        } else {
            let data : [number, string, string][] = []; // cnt, to, from
            for(const uid in this.members){ 
                if(!this.members[uid].isLiving) continue;
                data.push([cnt[uid], this.members[uid].voteTo, uid]);
            }
            data.sort();
            for(let i = data.length - 1; i >= 0; --i){
                if(!open){
                    desc += format(this.langTxt.p5.after_open_anonym, {from:this.members[data[i][2]].nickname, n:data[i][0]}) + "\n";
                }else if(data[i][1] == ""){
                    desc += format(this.langTxt.p5.after_open_format_n, {from:this.members[data[i][2]].nickname, n:data[i][0]}) + "\n";
                } else {
                    const to = this.members[data[i][1]].nickname;
                    desc += format(this.langTxt.p5.after_open_format, {from:this.members[data[i][2]].nickname, to:to, n:data[i][0]}) + "\n";
                }
            }
        }
        for(const uid in this.members){ 
            this.members[uid].voteTo = "";
        }
    
        const isLastVote = this.voteNum === this.ruleSetting.vote.revote_num;
    
        const ti = (this.voteNum == 0 ? "" : format(this.langTxt.p5.revote_times, {m : this.voteNum+1}));
        if(max_uid.length === 1 || (isLastVote && this.ruleSetting.vote.when_even == "random")){
            const eid = max_uid[Math.floor(Math.random() * max_uid.length)];
            const embed = new Discord.MessageEmbed({
                title: format(this.langTxt.p5.executed, {n: this.dayNumber, user : this.members[eid].nickname, time:ti}),
                description : desc,
                thumbnail   : {url: this.members[eid].user.displayAvatarURL()},
                color : this.langTxt.sys.killed_color,
                footer : {text: format(this.langTxt.p5.living_num, {n : living_num-1})},
            });
            this.channels.Living.send({embeds:[embed]});
            this.channels.GameLog.send({embeds:[embed]});
            this.lastExecuted = eid;
            await this.kickMember(eid, KickReason.Vote);
        }else if(isLastVote) {
            const embed = new Discord.MessageEmbed({
                title: format(this.langTxt.p5.final_even, {n: this.dayNumber, time:ti}),
                description : desc,
                color : this.langTxt.sys.no_killed_color,
                footer : {text: format(this.langTxt.p5.living_num, {n : living_num})},
            });
            this.channels.Living.send({embeds:[embed]});
            this.channels.GameLog.send({embeds:[embed]});
            this.lastExecuted = "";
            await this.startP6_Night();
        } else {
            const embed = new Discord.MessageEmbed({
                title: format(this.langTxt.p5.revote, {n: this.dayNumber, time:ti}),
                description : desc,
                color : this.langTxt.sys.system_color,
            });
            this.channels.Living.send({embeds:[embed]});
            this.channels.GameLog.send({embeds:[embed]});
            this.voteNum += 1;
            await this.startP5_Vote();
        }
    }

    createVoteEmbed(from : Discord.MessageEmbedAuthor, text : string, uid : string){
        return new Discord.MessageEmbed({
            author : from,
            title : format(text, {user: this.members[uid].nickname}),
            thumbnail : {url: this.members[uid].avatar},
            color: this.langTxt.sys.system_color,
        });
    }
    
    voteCheckInteract(interaction : Discord.ButtonInteraction){
        const uid = interaction.user.id;
        const tid = interaction.customId;
        if(tid == null) return;
        const uch = this.members[uid].uchannel;
        if(uch == null) return this.err();

        const realtime = 
            this.ruleSetting.vote.place == 'realtime_open' ||
            this.ruleSetting.vote.place == 'realtime_anonym' ||
            this.ruleSetting.vote.place == 'realtime_anonym_open';

        if(this.members[uid].validVoteID.find(i => i == tid) == null) {
            interaction.reply( {content : this.langTxt.p5.no_selfvote, ephemeral : true});
            return;
        }
        const change = this.members[uid].voteTo != "";
        const author : Discord.MessageEmbedAuthor = {name : this.members[uid].nickname, iconURL : this.members[uid].avatar};
        if(realtime && change){
            interaction.reply({
                embeds:[this.createVoteEmbed(author, this.langTxt.p5.no_revoting, this.members[uid].voteTo)],
                ephemeral: true
            });
            return;
        }
        const tName = this.members[tid].nickname;
        if(this.members[uid].voteTo == tid){
            interaction.reply({
                embeds:[this.createVoteEmbed(author, this.langTxt.p5.already_vote, tid)],
                ephemeral: true
            });
            return;
        }
        this.members[uid].voteTo = tid;
        if(!realtime){
            if(change){
                interaction.reply({
                    embeds:[this.createVoteEmbed(author, this.langTxt.p5.vote_change, tid)],
                    ephemeral: true
                });
            }else{
                interaction.reply({
                    embeds:[this.createVoteEmbed(author, this.langTxt.p5.vote_accept, tid)],
                    ephemeral: true
                });
            }
        } else if(this.ruleSetting.vote.place == 'realtime_open') {
            interaction.reply({
                embeds:[this.createVoteEmbed(author, this.langTxt.p5.vote_accept_1, tid)],
                ephemeral: false
            });
            this.channels.Living.send(format(this.langTxt.p5.vote_format, {to : tName, from : this.members[uid].nickname}));
        } else {
            interaction.reply({
                embeds:[this.createVoteEmbed(author, this.langTxt.p5.vote_accept_1, tid)],
                ephemeral: false
            });
            this.channels.Living.send(format(this.langTxt.p5.vote_anonym_format, {to : tName}));
        }
    }
    ////////////////////////////////////////////
    // Phase.p6_Night
    ////////////////////////////////////////////
    async startP6_Night(){
        this.phase = Phase.p6_Night;
        this.remTime = this.ruleSetting.night.length;
        this.updateRoomsRW();
        this.streams.setBGM(this.srvSetting.music.night);
        this.httpGameState.updatePhase(format(this.langTxt.p6.phase_name, {n : this.dayNumber}));

        const nightComingMessage = format(this.langTxt.p6.start, {time : this.getTimeFormatFromSec(this.remTime)});
        const nightComingEmbed = {embeds:[new Discord.MessageEmbed({
            title       : nightComingMessage,
            color       : this.langTxt.sys.system_color,
        })]};
        this.channels.Living.send(nightComingEmbed);
        this.cutTimeMember = Object.create(null);
        for(let my_id in this.members){
            this.members[my_id].voteTo = "";
            if(!this.members[my_id].isLiving) continue;
            const uch = this.members[my_id].uchannel;
            if(uch == null) return this.err();
            const role = this.members[my_id].role;

            if(role == Role.Priest){
                uch.send(getUserMentionStrFromId(my_id) + nightComingMessage);
                this.sendFP_Result(my_id, uch, this.lastExecuted, this.langTxt.priest, this.langTxt.role_img.Priest);
            }else if(role == Role.Knight){
                uch.send(getUserMentionStrFromId(my_id) + nightComingMessage);
                this.interactControllers[InteractType.Knight] = Object.create(null);
                this.members[my_id].validVoteID = [];
                let lastGuard = "";
                if(!this.ruleSetting.continuous_guard && this.members[my_id].actionLog.length > 0){
                    lastGuard = this.members[my_id].actionLog.slice(-1)[0][0];
                }
                let buttons    : Discord.MessageButton[] = [];
                for(const tid in this.members){
                    if(tid == my_id) continue;
                    if(tid == lastGuard) continue;
                    if(!this.members[tid].isLiving) continue;
                    this.members[my_id].validVoteID.push(tid);
                    buttons.push(Util.make_button(tid, this.members[tid].nickname, {style : "blue"}));
                }
                const embed = new Discord.MessageEmbed({
                    author      : {name: this.langTxt.role[role], iconURL: this.langTxt.role_img[role]},
                    title       : this.langTxt.knight.title,
                    color       : this.langTxt.team_color[getDefaultTeams(role)],
                });
                const sent_message = await uch.send({
                    embeds: [embed],
                    components: Util.arrange_buttons(buttons)
                })
                this.interactControllers[InteractType.Knight][sent_message.id] = sent_message;
            } else if(role == Role.Seer){
                uch.send(getUserMentionStrFromId(my_id) + nightComingMessage);
                this.interactControllers[InteractType.Seer] = Object.create(null);
                this.members[my_id].validVoteID = [];
                let buttons    : Discord.MessageButton[] = [];
                for(const tid in this.members){
                    if(tid == my_id) continue;
                    if(!this.members[tid].isLiving) continue;
                    if(this.members[my_id].actionLog.find(p => p[0] == tid) != null) continue;
                    this.members[my_id].validVoteID.push(tid);
                    buttons.push(Util.make_button(tid, this.members[tid].nickname, {style : "blue"}));
                }
                if(this.members[my_id].validVoteID.length == 0){
                    this.sendFP_Result(my_id, uch, null, this.langTxt.fortune, this.langTxt.role_img.Seer);
                } else {
                    const embed = new Discord.MessageEmbed({
                        author      : {name: this.langTxt.role[role], iconURL: this.langTxt.role_img[role]},
                        title       : this.langTxt.fortune.title,
                        color       : this.langTxt.team_color[getDefaultTeams(role)],
                    });
                    if(this.members[my_id].validVoteID.length == 1){
                        uch.send({embeds: [embed]});
                        this.sendFP_Result(my_id, uch, this.members[my_id].validVoteID[0], this.langTxt.fortune, this.langTxt.role_img.Seer);
                        this.members[my_id].validVoteID = [];
                    }else{
                        const sent_message = await uch.send({
                            embeds: [embed],
                            components: Util.arrange_buttons(buttons)
                        })
                        this.interactControllers[InteractType.Seer][sent_message.id] = sent_message;
                    }
                }
            } else if(this.members[my_id].allowWolfRoom){
            } else {
                uch.send(nightComingEmbed);
            }
            {
                const component = new Discord.MessageActionRow().addComponents(Util.make_button("cut_time", this.langTxt.p4.cut_time_label, {style : "red"}));
                const sent_message = await uch.send({content: this.langTxt.sys.cuttime_desc, components: [component]});
                this.interactControllers[InteractType.CutTime][sent_message.id] = sent_message;
            }
        }
        { // for Werewolf
            this.interactControllers[InteractType.Werewolf] = Object.create(null);
            const role = Role.Werewolf;
            this.wolfValidTo   = [];
            this.wolfValidFrom = [];
            this.wolfVote = "";
            let buttons    : Discord.MessageButton[] = [];
            for(const tid in this.members){
                if(!this.members[tid].isLiving) continue;
                if(this.members[tid].role == Role.Werewolf) continue;
                this.wolfValidTo.push(tid);
                buttons.push(Util.make_button(tid, this.members[tid].nickname, {style : "blue"}));
            }
            const embed = new Discord.MessageEmbed({
                author      : {name: this.langTxt.role[role], iconURL: this.langTxt.role_img[role]},
                title       : this.langTxt.werewolf.title,
                color       : this.langTxt.team_color[getDefaultTeams(role)],
            });
            const sent_message = await this.channels.Werewolf.send({
                embeds: [embed],
                components: Util.arrange_buttons(buttons)
            });
            this.interactControllers[InteractType.Werewolf][sent_message.id] = sent_message;
            let werewolfsMention = "";
            for(const tid in this.members){
                if(!this.members[tid].isLiving) continue;
                if(!this.members[tid].allowWolfRoom) continue;
                werewolfsMention += getUserMentionStrFromId(tid);
            }
            this.channels.Werewolf.send(werewolfsMention + nightComingMessage);
            for(let my_id in this.members){
                if(!this.members[my_id].isLiving) continue;
                if(this.members[my_id].role == Role.Werewolf) {
                    this.wolfValidFrom.push(my_id);
                }
            }
        }
        this.stopTimerRequest = false;
        gameTimer(this.gameId, this, Phase.p6_Night, this.ruleSetting.night.alert_times, dummy_nightFinish);
    }
    nightKnightCheck(interaction : Discord.ButtonInteraction) {
        const tid = Object.keys(this.members).find(mid => mid == interaction.customId);
        if(tid == null) return;
        const uid = interaction.user.id;
        const uch = this.members[uid].uchannel;
        if(uch == null) return this.err();
        if(this.members[uid].validVoteID.find(i => i == tid)){
            const change = this.members[uid].voteTo != "";
            const role = Role.Knight;
            const author : Discord.MessageEmbedAuthor = {name: this.langTxt.role[role], iconURL: this.langTxt.role_img[role]};
            if(this.members[uid].voteTo == tid){
                interaction.reply({embeds:[this.createVoteEmbed(author, this.langTxt.knight.already, tid)]});
                return;
            }
            this.members[uid].voteTo = tid;
            if(change){
                interaction.reply({embeds:[this.createVoteEmbed(author, this.langTxt.knight.change, tid)]});
            }else{
                interaction.reply({embeds:[this.createVoteEmbed(author, this.langTxt.knight.accept, tid)]});
            }
        }
    }
    nightSeerCheck(interaction : Discord.ButtonInteraction) {
        const tid = Object.keys(this.members).find(mid => mid == interaction.customId);
        if(tid == null) return;
        const uid = interaction.user.id;
        const uch = this.members[uid].uchannel;
        if(uch == null) return this.err();

        if(this.members[uid].voteTo != "") return;
        if(this.members[uid].validVoteID.find(i => i == tid)){
            this.members[uid].voteTo = tid;
            this.members[uid].validVoteID = [];
            interaction.update({});
            this.sendFP_Result(uid, uch, tid, this.langTxt.fortune, this.langTxt.role_img.Seer);
        }
    }
    nightWerewolfCheck(interaction : Discord.ButtonInteraction) {
        const uid = interaction.user.id;
        if(this.wolfValidFrom.find(i => i == interaction.user.id) == null) return;
        const tid = Object.keys(this.members).find(mid => mid == interaction.customId);
        if(tid == null) return;

        if(this.wolfValidTo.find(id => id == tid) == null) return;
        const change = this.wolfVote != "";
        const author : Discord.MessageEmbedAuthor = {name: this.members[interaction.user.id].nickname, iconURL: this.langTxt.role_img[Role.Werewolf]};
        if(this.wolfVote == tid){
            interaction.reply({embeds : [this.createVoteEmbed(author, this.langTxt.werewolf.already, tid)]});
            return;
        }
        this.wolfVote = tid;
        if(change){
            interaction.reply({embeds:[this.createVoteEmbed(author, this.langTxt.werewolf.change, tid)]});
        }else{
            interaction.reply({embeds:[this.createVoteEmbed(author, this.langTxt.werewolf.accept, tid)]});
        }
    }
    cutTimeCheck(interaction : Discord.ButtonInteraction) {
        const uid = interaction.user.id;
        const uch = this.members[uid].uchannel;
        if(uch == null) return this.err();
        if (interaction.customId != "cut_time") return;
        const isAdd = true; // TODO
        const liveNum =  Object.keys(this.members).reduce((acc, value) => { return acc + (this.members[value].isLiving?1:0);}, 0);
        const req = liveNum;
        if(!isAdd){
            delete this.cutTimeMember[uid];
            const now = Object.keys(this.cutTimeMember).length;
            const txt = format(this.langTxt.p4.cut_time_cancel, {now : now, req : req});
            interaction.reply(txt);
            this.channels.Living.send(txt);
        } else {
            this.cutTimeMember[uid] = 1;
            const now = Object.keys(this.cutTimeMember).length;
            const txt = format(this.langTxt.p4.cut_time_accept, {now : now, req : req});
            interaction.reply(txt);
            this.channels.Living.send(txt);
            if(now >= req) {
                this.channels.Living.send(this.langTxt.p4.cut_time_approved);
                this.remTime = Math.min(12, this.remTime);
            }
        }
    }
    async nightFinish(){
        this.interactControllers[InteractType.Knight]   = Object.create(null);
        this.interactControllers[InteractType.Seer]     = Object.create(null);
        this.interactControllers[InteractType.Werewolf] = Object.create(null);
        this.interactControllers[InteractType.CutTime] = Object.create(null);

        let Guarded : string[] = [];
        for(const uid in this.members){
            if(this.members[uid].role != Role.Knight) continue;
            if(!this.members[uid].isLiving) continue;
            this.members[uid].actionLog.push([this.members[uid].voteTo, TeamNames.Other]);
            if(this.members[uid].voteTo == "") {
                const uch = this.members[uid].uchannel;
                if(uch == null) return this.err();
                uch.send(this.langTxt.knight.no_select);
                continue;
            }
            Guarded.push(this.members[uid].voteTo);
        }
        Object.keys(this.members);
        this.killNext = [];

        if(this.wolfVote == ""){
            if(this.wolfValidTo.length == 0) this.err();
            this.wolfVote = this.wolfValidTo[Math.floor(Math.random() * this.wolfValidTo.length)];
            this.channels.Werewolf.send(format(this.langTxt.werewolf.no_select, {user: this.members[this.wolfVote].nickname}));
        }

        this.wolfLog.push(this.wolfVote);
        if(Guarded.find(id => id == this.wolfVote) == null){
            this.killNext.push([this.wolfVote, 0]);
            await this.kickMember(this.wolfVote, KickReason.Werewolf);
            if(this.phase != Phase.p6_Night) return;
        }
        await this.startP4_Daytime();
    }


    ////////////////////////////////////////////
    // Phase.p7_GameEnd
    ////////////////////////////////////////////
    gameEnd(winTeam : TeamNames){
        this.phase = Phase.p7_GameEnd;
        
        let dlist : [string, string][] = [];
        for(const uid in this.members){
            if(!this.members[uid].isLiving){
                dlist.push([uid, this.channels.LivingVoice.id]);
            }
        }
        this.updateRoomsRW();
        let list : [boolean, number, string][] = []; // win, liveDay, username

        let fieldsSeer   : Discord.EmbedField[] = [];
        let fieldsPriest : Discord.EmbedField[] = [];
        let fieldsKnight : Discord.EmbedField[] = [];
        let wolfNames = "";
        for(const uid in this.members){
            const role = this.members[uid].role;
            if(role == null) return this.err();
            const team = getDefaultTeams(role);
            const isWin = team == winTeam;
            list.push([
                isWin,
                this.members[uid].livingDays < 0 ? -114514 : -this.members[uid].livingDays,
                format(this.langTxt.p7.result_format, {
                    emo : this.langTxt.emo[role],
                    role : this.langTxt.role[role],
                    team : this.langTxt.team_name[team],
                    name : this.members[uid].nickname
                })
            ]);
            if(role == Role.Werewolf){
                wolfNames += this.members[uid].nickname;
            }
            if(role == Role.Seer || role == Role.Priest){
                let dat = "";
                for(let i in this.members[uid].actionLog){
                    let a = this.members[uid].actionLog[i][0];
                    let b = this.members[uid].actionLog[i][1];
                    if(a == ""){
                        dat += this.langTxt.sys.no_result + "\n";
                    }else{
                        dat += this.langTxt.team_emo[b] + this.members[a].nickname + "\n";
                    }
                }
                if(dat == "") dat = this.langTxt.sys.no_result;
                if(role == Role.Seer){
                    fieldsSeer.push({value : dat, inline : true,
                        name : format(this.langTxt.p7.log, {emo : this.langTxt.emo[role], role : this.langTxt.role[role], name : this.members[uid].nickname})
                    });
                } else {
                    fieldsPriest.push({value : dat, inline : true,
                        name : format(this.langTxt.p7.log, {emo : this.langTxt.emo[role], role : this.langTxt.role[role], name : this.members[uid].nickname})
                    });
                }
            }
            if(role == Role.Knight){
                let dat = "";
                for(let i in this.members[uid].actionLog){
                    let a = this.members[uid].actionLog[i][0];
                    if(a == ""){
                        dat += this.langTxt.sys.no_result +"\n";
                    }else{
                        dat += this.members[a].nickname + "\n";
                    }
                }
                if(dat == "") dat = this.langTxt.sys.no_result;
                fieldsKnight.push({value : dat, inline : true,
                    name : format(this.langTxt.p7.log, {emo : this.langTxt.emo[role], role : this.langTxt.role[role], name : this.members[uid].nickname})
                });
            }
        }
        let fields : Discord.EmbedField[] = [];
        {
            let dat = "";
            for(let i in this.wolfLog){
                const a = this.wolfLog[i] == "" ? this.langTxt.sys.no_result : this.members[this.wolfLog[i]].nickname;
                dat += a + "\n";
            }
            if(dat == "") dat = this.langTxt.sys.no_result;
            fields.push({value : dat, inline : true,
                name : format(this.langTxt.p7.log, {emo : this.langTxt.emo.Werewolf, role : this.langTxt.role.Werewolf, name : wolfNames})
            });
        }
        for(const i in fieldsKnight) {fields.push(fieldsKnight[i]);}
        for(const i in fieldsSeer)   {fields.push(fieldsSeer[i]);}
        for(const i in fieldsPriest) {fields.push(fieldsPriest[i]);}

        list = list.sort();
        let desc = this.langTxt.p7.win + "\n";
        let winFlag = true;
        for(let i = list.length-1; i >= 0; --i){
            if(winFlag == true && list[i][0] == false){
                desc += "\n" + this.langTxt.p7.lose + "\n"; 
                winFlag = false;
            }
            desc += list[i][2] + "\n";
        }
        desc += "\n\n";
        const embed = new Discord.MessageEmbed({
            author      : {name: this.langTxt.p7.title, iconURL: this.langTxt.team_img[winTeam]},
            title       : format(this.langTxt.p7.main, {team : this.langTxt.team_name[winTeam]}),
            thumbnail   : {url: this.langTxt.team_img[winTeam]},
            description : desc,
            color       : this.langTxt.team_color[winTeam],
            fields      : fields,
        });
        this.channels.Living.send({embeds: [embed]});
        this.channels.GameLog.send({embeds: [embed]});

        let MentionText = "";
        for(const mid in this.members){
            MentionText += getUserMentionStrFromId(mid) + " ";
        }

        this.remTime = this.ruleSetting.after_game.length;
        MentionText += "\n" + format(this.langTxt.p7.continue, {time : this.getTimeFormatFromSec(this.remTime), cmd : this.langTxt.p7.cmd_continue[0], brk : this.langTxt.p7.cmd_breakup[0]});
        this.channels.Living.send(MentionText);

        if(winTeam == TeamNames.Good){
            this.streams.setBGM(this.srvSetting.music.good_win);
        } else if(winTeam == TeamNames.Evil){
            this.streams.setBGM(this.srvSetting.music.evil_win);
        }else{

        }
        this.httpGameState.updateMembers();
        
        this.remTime = this.ruleSetting.after_game.length;
        this.httpGameState.updatePhase(format(this.langTxt.p7.phase_name, {team : this.langTxt.team_name[winTeam]}));
        this.httpGameState.updateTimer();
        this.stopTimerRequest = false;
        gameTimer(this.gameId, this, Phase.p7_GameEnd, this.ruleSetting.after_game.alert_times, dummy_gameEndFinish);
    }

    gameEndFinish(){
        this.destroy();
    }
    ////////////////////////////////////////////

    needGmPerm(ch : Discord.TextChannel){
        let fields : Discord.EmbedField[] = [];
        {
            let dat = "";
            for(let uid in this.GM){
                const u = this.GM[uid];
                dat += (u == null ? uid : getNicknameFromMem(u)) + "\n";
            }
            if(dat == "") dat = "(None)"
            fields.push({name : this.langTxt.sys.sys_GM_list_title, value : dat, inline:true});
        }
        {
            let dat = "";
            for(let uid in this.developer){
                const u = this.GM[uid];
                dat += (u == null ? uid : getNicknameFromMem(u)) + "\n";
            }
            if(dat == "") dat = "(None)"
            fields.push({name : this.langTxt.sys.sys_Dev_list_title, value : dat, inline:true});
        }
        ch.send({embeds: [{
            title: this.langTxt.sys.sys_need_GM_perm,
            color: this.langTxt.sys.system_err_color,
            author: {name: "Error!", icon_url: "https://twemoji.maxcdn.com/2/72x72/1f6ab.png"},
            fields : fields,
        }]});
    }
    needDevPerm(ch : Discord.TextChannel){
        let fields : Discord.EmbedField[] = [];
        {
            let dat = "";
            for(let uid in this.developer){
                const u = this.GM[uid];
                dat += (u == null ? uid : getNicknameFromMem(u)) + "\n";
            }
            if(dat == "") dat = "(None)"
            fields.push({name : this.langTxt.sys.sys_Dev_list_title, value : dat, inline : true});
        }
        ch.send({embeds: [{
            title: this.langTxt.sys.sys_need_Dev_perm,
            color: this.langTxt.sys.system_err_color,
            author: {name: "Error!", icon_url: "https://twemoji.maxcdn.com/2/72x72/1f6ab.png"},
            fields : fields,
        }]});
    }
    reloadDefaultRule(){
        const SysRuleSet = loadAndSetSysRuleSet("./rule_setting_templates/default.json5");
        if(SysRuleSet == null){
        } else {
            this.ruleSetting = SysRuleSet;
            this.setRoles(SysRuleSet);
            this.sendWantNums(this.channels.Living);
        }
    }
    async interactCommand(interaction : Discord.ButtonInteraction){
        if(this.phase == Phase.p1_Wanted){
            const mes_id = Object.keys(this.interactControllers[InteractType.Accept]).find(v => v == interaction.message.id);
            if(mes_id == null) return;
            const mes = this.interactControllers[InteractType.Accept][mes_id];
            await this.joinMemberInteract(interaction, mes);
            return;
        }

        const uid = Object.keys(this.members).find(k => k == interaction.user.id);
        if(uid == null) return;
        if(!this.members[uid].isLiving) return;
        const uch = this.members[uid].uchannel;
        if(uch == null) return;

        for(let i = 0; i < this.interactControllers.length; i++) {
            if(Object.keys(this.interactControllers[i]).find(v => v == interaction.message.id) == null) continue;
            if(i == InteractType.Accept){
                if(this.phase == Phase.p2_Preparation){
                    if(interaction.channelId != uch.id) return;
                    this.preparationAccept(uid, interaction);
                    return;
                }
            }
            if(i == InteractType.WishRole){
                if(this.phase == Phase.p2_Preparation) {
                    if(interaction.channelId != uch.id) return;
                    this.wishRoleCheck(interaction);
                }
            }
            if(i == InteractType.Vote){
                if(this.phase == Phase.p5_Vote){
                    if(this.members[uid].validVoteID.length == 0) return;
                    this.voteCheckInteract(interaction);
                    return;
                }
                return;
            }
            if(i == InteractType.CO_Call){
                if(this.phase == Phase.p4_Daytime){
                    if(interaction.channelId != uch.id) return;
                    this.call_co_cuttime_CheckInteract(interaction);
                    return;
                }
                return;
            }
            if(i == InteractType.Knight){
                if(this.phase == Phase.p6_Night) {
                    if(interaction.channelId != uch.id) return;
                    this.nightKnightCheck(interaction);
                    return;
                }
            }
            if(i == InteractType.Seer){
                if(this.phase == Phase.p6_Night) {
                    if(interaction.channelId != uch.id) return;
                    this.nightSeerCheck(interaction);
                    return;
                }
            }
            if(i == InteractType.Werewolf){
                if(this.phase == Phase.p6_Night) {
                    if(interaction.channelId != this.channels.Werewolf.id) return;
                    this.nightWerewolfCheck(interaction);
                }
            }
            if(i == InteractType.CutTime){
                if(this.phase == Phase.p6_Night) {
                    if(interaction.channelId != uch.id) return;
                    await this.cutTimeCheck(interaction);
                }
            }
            if(i == InteractType.Dictator){
                if(this.phase == Phase.p4_Daytime) {
                    if(interaction.channelId != uch.id) return;
                    await this.dictatorCheck(interaction);
                }
            }
        }
    }
    async command(message : Discord.Message){
        if (message.content.startsWith('phase')) {
            message.channel.send(this.phase); return;
        }

        const isDeveloper = (message.author.id in this.developer);
        const isGM        = isDeveloper || (message.author.id in this.GM);

        if(isThisCommand(message.content, this.langTxt.p7.cmd_continue) >= 0){
            await this.resetGame();
            return;
        }

        if(isThisCommand(message.content, this.langTxt.sys.cmd_reload_rule) >= 0){
            if(isGM){ this.reloadDefaultRule();
            } else if(message.channel.type == 'GUILD_TEXT') {  this.needGmPerm(message.channel);
            }
            return;
        }

        if(isThisCommand(message.content, this.langTxt.sys.cmd_link_voice) >= 0){
            if(isGM){ await this.voiceChannelsLink();
            } else if(message.channel.type == 'GUILD_TEXT') {  this.needGmPerm(message.channel);
            }
            return;
        }
        if(isThisCommand(message.content, this.langTxt.sys.cmd_unlink_voice) >= 0){
            if(isGM){ await this.voiceChannelsLink();
            } else if(message.channel.type == 'GUILD_TEXT') {  this.needGmPerm(message.channel);
            }
            this.voiceChannelsUnlink();
            return;
        }
        if(isThisCommand(message.content, this.langTxt.sys.cmd_stop_timer) >= 0){
            const ch = message.channel;
            if(ch.type == 'GUILD_TEXT') {
                if(isGM){ this.stopTimer(ch);
                }else{ this.needGmPerm(ch) }
            }
            return;
        }
        if(isThisCommand(message.content, this.langTxt.sys.cmd_resume_timer) >= 0){
            const ch = message.channel;
            if(ch.type == 'GUILD_TEXT') {
                if(isGM){ this.resumeTimer(ch);
                }else{ this.needGmPerm(ch) }
            }
        }
        
        if(isThisCommand(message.content, this.langTxt.sys.cmd_member_list) >= 0){
            const ch = message.channel;
            if(ch.type == 'GUILD_TEXT') {
                this.sendMemberList(ch);
            }
            return;
        }
        if(isThisCommand(message.content, this.langTxt.sys.cmd_update_perm) >= 0){
            this.updateRoomsRW()
            return;
        }
        ///////////////////////////////////////////////////////////////////
        if(this.phase == Phase.p0_UnStarted ){
            if(isThisCommand(message.content, this.langTxt.p0.cmd_start) >= 0){
                this.phase = Phase.p1_Wanted;
                this.GM[message.author.id] = message.member;
                this.sendWantNums(this.channels.Living);
                
                const join_button = Util.make_button("join", this.langTxt.p1.cmd_join[0], {style : "green", emoji: this.langTxt.role_uni.Werewolf});
                const sent_message = await this.channels.Living.send({
                    content: this.langTxt.p0.start_recruiting,
                    components: [ new Discord.MessageActionRow().addComponents(join_button) ]
                });
                this.interactControllers[InteractType.Accept][this.channels.Living.id] = sent_message;
                this.httpGameState.updatePhase(this.langTxt.p1.phase_name);
                this.updateWantedEmb(null);
                return;
            }
            return;
        }
        ///////////////////////////////////////////////////////////////////
        if(this.phase == Phase.p1_Wanted){
            let idx = 0;
            idx = isThisCommand(message.content, this.langTxt.sys.cmd_change_rule);
            if(idx >= 0){
                if(isGM){ 
                    this.changeRule(message.content.substring(this.langTxt.sys.cmd_change_rule[idx].length));
                } else if(message.channel.type == 'GUILD_TEXT') {
                    this.needGmPerm(message.channel);
                }
                return;
            }
            if(isThisCommand(message.content, this.langTxt.p1.cmd_join_force) >= 0){
                this.joinMember(message, true);
                return;
            }
            if(isThisCommand(message.content, this.langTxt.p1.cmd_join) >= 0){
                this.joinMember(message);
                return;
            }
            if(isThisCommand(message.content, this.langTxt.p1.cmd_leave) >= 0){
                this.leaveMember(message);
                return;
            }
            if(isThisCommand(message.content, this.langTxt.p1.cmd_kick) >= 0){
                this.kickEntryMember(message);
                return;
            }
            if(isThisCommand(message.content, this.langTxt.p1.cmd_start) >= 0){
                await this.checkStartGame(message);
                return;
            }
            idx = isThisCommand(message.content, this.langTxt.p1.cmd_setroles);
            if(idx >= 0){
                if(isGM){ this.setRolesStr(message.content.substring(this.langTxt.p1.cmd_setroles[idx].length));
                } else if(message.channel.type == 'GUILD_TEXT') {  this.needGmPerm(message.channel);
                }
                return;
            }
            return;
        }
        ///////////////////////////////////////////////////////////////////
        if(this.phase == Phase.p2_Preparation){
            if(Object.keys(this.members).find(k => k == message.author.id) != null){
                const uch = this.members[message.author.id].uchannel;
                if(uch != null && message.channel.id == uch.id){
                    this.preparationAccept(message.author.id, null);
                }
            }
            if(message.channel.id == this.channels.Living.id){
                if(isThisCommand(message.content, this.langTxt.p2.cmd_start_force) >= 0){
                    this.forceStartGame();
                    return;
                }
            }
            return;
        }
        ///////////////////////////////////////////////////////////////////
        if(this.phase == Phase.p7_GameEnd){
            if(isThisCommand(message.content, this.langTxt.p7.cmd_breakup) >= 0){
                this.gameEndFinish();
                return;
            }
        }
    }
}

function gameTimer(gid : number, obj : GameState, tPhase : Phase, alert_times : number[], func : (gid : number, obj : GameState)=> unknown, callFromTimer : boolean = false){
    //! no use "this."
    // console.log(obj.remTime);
    if(gid != obj.gameId) return;
    if(obj.phase != tPhase) return;
    obj.isTimerProgress = true;
    if(obj.stopTimerRequest){
        obj.timerList.push(setTimeout(gameTimer, 1000, gid, obj, tPhase, alert_times, func, true));
        return;
    }
    if(callFromTimer){
        const idx = obj.srvSetting.se.times.findIndex(p => p[0] == obj.remTime);
        if(idx >= 0){
            obj.streams.playSe(obj.srvSetting.se.times[idx][1]);
        }
    }
    if(alert_times.find(v => v === obj.remTime) != null){
        const text = format(obj.langTxt.sys.remaining_time, {time : obj.getTimeFormatFromSec(obj.remTime)});
        if(obj.phase == Phase.p3_FirstNight){
            obj.channels.Werewolf.send(text);

        }else if(obj.phase == Phase.p5_Vote){
            obj.broadcastLivingUserChannel(text);

        }else if(obj.phase == Phase.p6_Night) {
            obj.channels.Werewolf.send(text);
            for(const uid in obj.members){
                if(!obj.members[uid].isLiving) continue;
                const uch = obj.members[uid].uchannel;
                if(uch == null) continue;
                const role = obj.members[uid].role;
                switch (role) {
                    case Role.Seer:
                    case Role.Knight:
                        uch.send(text);
                }
            }
        }
        obj.channels.Living.send(text);
    }
    obj.httpGameState.updateTimer();
    if(obj.remTime <= 0){
        obj.channels.Living.send(obj.langTxt.sys.time_is_up);
        obj.isTimerProgress = false;
        func(gid, obj);
    }else{
        obj.remTime -= 1;
        obj.timerList.push(setTimeout(gameTimer, 1000, gid, obj, tPhase, alert_times, func, true));
    }
}

////////////////////////////////////////////
// dummys
////////////////////////////////////////////


async function dummy_gamePreparation2(gid : number, obj : GameState){
    if(gid != obj.gameId) return;
    await obj.gamePreparation2();
}

async function dummy_startP4Daytime(gid : number, obj : GameState){
    if(gid != obj.gameId) return;
    await obj.startP4_Daytime();
}

async function dummy_startP5Vote(gid : number, obj : GameState){
    if(gid != obj.gameId) return;
    await obj.startP5_Vote();
}
async function dummy_voteTimeup(gid : number, obj : GameState){
    if(gid != obj.gameId) return;
    obj.voteTimeup();
}
async function dummy_nightFinish(gid : number, obj : GameState){
    await obj.nightFinish();
}

async function dummy_gameEndFinish(gid : number, obj : GameState){
    obj.gameEndFinish();
}
