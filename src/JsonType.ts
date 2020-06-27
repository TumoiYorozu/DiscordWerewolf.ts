import {nul, bool, num, str, literal, opt, arr, tuple, obj, union, TsType, validatingParse} from 'ts-json-validator';

// https://github.com/nwtgck/ts-json-validator
// https://qiita.com/nwtgck/items/1cc44b6d445ae1d48957

export const RolesStr = obj({
    Villager       : str,
    Seer           : str,
    Priest         : str,
    Knight         : str,
    Werewolf       : str,
    Traitor        : str,
    Mason          : str,
    Dictator       : str,
    Baker          : str,
    Communicatable : str,
});
export type RolesStrType = TsType<typeof RolesStr>;
const RolesStrs = obj({
    Villager       : arr(str),
    Seer           : arr(str),
    Priest         : arr(str),
    Knight         : arr(str),
    Werewolf       : arr(str),
    Traitor        : arr(str),
    Mason          : arr(str),
    Dictator       : arr(str),
    Baker          : arr(str),
    Communicatable : arr(str),
});
const RolesOptNum = obj({
    Villager       : opt(num),
    Seer           : opt(num),
    Priest         : opt(num),
    Bodyguard      : opt(num),
    Werewolf       : opt(num),
    Traitor        : opt(num),
    Mason          : opt(num),
    Dictator       : opt(num),
    Baker          : opt(num),
    Communicatable : opt(num),
});

const fortune_or_priest = obj({
    result_title   : str,
    no_result      : str,
    no_wolf        : str,
    is_wolf        : str,
    same_team_role : str,
    log            : str,
    title          : str,
    list           : str,
});
export type FortunePriestType = TsType<typeof fortune_or_priest>;

const userCommand = obj({
    cmd        : arr(str),
    desc       : str,
});
const gmCommand = obj({
    cmd        : arr(str),
    desc       : str,
});
const devCommand = obj({
    cmd        : arr(str),
    desc       : str,
});
export type UserCommandType = TsType<typeof userCommand>;
export type GmCommandType   = TsType<typeof gmCommand>;
export type DevCommandType  = TsType<typeof devCommand>;


export const LangTypeFormat = obj({
    game
    :obj({
        room_Werewolf    : str,
        room_GameLog     : str,
        room_DebugLog    : str,
        room_Living      : str,
        room_LivingVoice : str,
        room_Dead        : str,
        room_DeadVoice   : str,
    }),

    sys
    :obj({
        cmd_make_room    : arr(str),
        cmd_link_voice   : arr(str),
        cmd_unlink_voice : arr(str),
        cmd_list_GM      : arr(str),
        cmd_list_Dev     : arr(str),
        cmd_add_GM       : arr(str),
        cmd_add_Dev      : arr(str),
        cmd_rm_GM        : arr(str),
        cmd_rm_Dev       : arr(str),
        cmd_role_num     : arr(str),
        cmd_reload_rule  : arr(str),
        cmd_member_list  : arr(str),
        cmd_change_rule  : arr(str),

        cmd_update_perm  : arr(str),
        cmd_stop_timer   : arr(str),
        cmd_resume_timer : arr(str),
        cmd_extend_time  : arr(str),
        cmd_cut_time     : arr(str),
        cmd_addtime      : arr(str),


        sym_err       : str,
        sym_warn      : str, 
        sym_info      : str, 

        sys_need_GM_perm   : str,
        sys_need_Dev_perm  : str,
        sys_GM_list_title  : str,
        sys_Dev_list_title : str,
        sys_start_browser  : str,


        system_color      : num,
        system_err_color  : num,
        system_warn_color : num,
        system_info_color : num,

        killed_color     : num,
        no_killed_color  : num,

        user_room_name : str,
        
        GM_added    : str,
        Dev_added   : str,
        GM_removed  : str,
        Dev_removed : str,
        Need_at_least_1_GM  : str,

        Link_Voice : str,
        Link_Voice_Err : str,
        Unlink_Voice   : str,

        stop_timer     : str,
        restart_timer  : str,
        no_timer       : str,

        Current_role_breakdown       : str,
        Current_role_breakdown_sum   : str,
        Current_join_member_num      : str,

        time_formatMS     : str,
        time_formatM      : str,
        time_formatS      : str,
        remaining_time    : str,
        time_is_up        : str,

        dead         : str,
        welcome_dead : str,
        no_result    : str,
    }),
    rule : obj({
        title : str,
        first_nights_fortune : obj({
            txt           : str,
            no_fortune    : str,
            random        : str,
            random_white  : str,
        }),
        continuous_guard : obj({
            txt : str,
            no  : str,
            yes : str,
        }),
        vote_place : obj({
            txt                  : str,
            realtime_open        : str,
            realtime_anonym      : str,
            realtime_anonym_open : str,
            after_open           : str,
            after_anonym         : str,
            no_open              : str,
        }),

        vote_num : obj({
            txt                  : str,
        }),

        vote_even : obj({
            txt                  : str,
            random               : str,
            no_exec              : str,
        }),
    }),

    role     : RolesStr,
    emo      : RolesStr,
    role_img : RolesStr,
    role_uni : RolesStr,
    role_descs : RolesStr,

    team_name
    :obj({
        Good  : str,
        Evil  : str,
        Other : str,
    }),
    team_emo
    :obj({
        Good    : str,
        Evil    : str,
        Other   : str,
        White   : str,
        Black   : str,
        Unknown : str,
    }),
    team_img
    :obj({
        Good  : str,
        Evil  : str,
        Other : str,
    }),
    team_color
    :obj({
        Good  : num,
        Evil  : num,
        Other : num,
    }),

    react
    :obj({
        o   : str,
        x   : str,
        alp : arr(str),
    }),

    p0
    :obj({
        cmd_start         : arr(str),
        cmd_setroles      : str,

        pong              : str,
        make_room         : str,
        rediscovered_room : str,
        start_recruiting  : str,

        breakdown_changed : str,
    }),

    p1
    :obj({
        cmd_join  : arr(str),
        cmd_leave : arr(str),
        cmd_kick : arr(str),
        cmd_start : arr(str),
        cmd_join_force  : arr(str),
        cmd_setroles      : arr(str),

        
        phase_name        : str,
        start_p1          : str,
        already_in        : str,
        no_join           : str,
        welcome           : str,
        see_you           : str,
        err_join_admin    : str,
        warn_join_admin   : str,

        current_count     : str,
        member_full       : str,
        member_not_enough : str,
        member_over       : str,
    }),
    
    p2
    :obj({
        cmd_start_force  : arr(str),
        
        phase_name       : str,
        start_preparations : str,
        announce_role      : str,
        announce_next      : str,
        done_preparations  : str,

        mate_names_title   : str,

        already_ac         : str,
        new_accept         : str,
        all_accept         : str,

        incomplete_ac      : str,
        cant_force_start   : str,
        force_start        : str,

        wish_role_preparations : str,
        wish_role_desc1        : str,
        wish_role_desc2        : str,
        wish_role_desc3        : str,
        wish_role_desc_wish    : str,
        wish_role_desc_nowish  : str,
        wish_role_req          : str,
    }),
    
    p3
    :obj({
        phase_name                : str,
        no_fortune                : str,
        random_fortune            : str,
        random_white_fortune      : str,
        length_of_the_first_night : str,
    }),

    p4
    :obj({
        phase_name           : str,
        no_killed_morning    : str,
        killed_morning       : str,
        day_number           : str,
        living_and_num       : str,
        length_of_the_day    : str,

        coming_out_sel_title  : str,
        call_white_sel_title  : str,
        call_black_sel_title  : str,
        role_list             : str,
        member_list           : str,
        coming_out_open_title : str,
        call_white_open_title : str,
        call_black_open_title : str,
        call_time             : str,
        publish_order         : str,

        cut_time_title        : str,
        cut_time_accept       : str,
        cut_time_cancel       : str,
        cut_time_approved     : str,
    }),

    p5
    :obj({
        phase_name    : str,
        end_daytime   : str,
        start_vote    : str,
        vote_title    : str,
        vote_desc     : str,
        vote_list     : str,
        
        vote_accept   : str,
        vote_accept_1 : str,
        vote_change   : str,
        already_vote  : str,
        no_revoting   : str,
        
        vote_format        : str,
        vote_anonym_format : str,
        
        revote_times       : str,
        executed           : str,
        after_open_title   : str,
        revote             : str,
        final_even         : str,
        after_open_format  : str,
        after_open_format_n: str,
        after_open_anonym  : str,
        after_no_open      : str,
        living_num         : str,
    }),

    p6
    :obj({
        phase_name    : str,
        start : str,
    }),

    p7
    :obj({
        cmd_continue  : arr(str),
        cmd_breakup   : arr(str),
        phase_name    : str,
        title         : str,
        main          : str,
        win           : str,
        lose          : str,
        result_format : str,
        log           : str,
        continue      : str,
        breakup       : str,
    }),

    baker
    :obj({
        repertoire : arr(str),
        deliver    : str,
        killed     : str,
    }),

    dictator 
    :obj({
        uni          : str,
        button_title : str,
        button_desc  : str,
        exercise     : str,
    }),

    fortune : fortune_or_priest,
    priest  : fortune_or_priest,

    knight
    :obj({
        title      : str,
        list       : str,
        already    : str,
        accept     : str,
        change     : str,
        no_select  : str,
    }),
    
    werewolf
    :obj({
        start_room_title : str,
        title            : str,
        list             : str,
        already          : str,
        accept           : str,
        change           : str,
        no_select        : str,
    }),
});
export type LangType = TsType<typeof LangTypeFormat>;


export const RuleTypeFormat = obj({
    //roles : str
    role_nums : RolesOptNum,
    
    first_nights_fortune: union(
        literal('no_fortune' as const),
        literal('random' as const),
        literal('random_white' as const),
        // literal('no_limit' as const),
    ),
    continuous_guard : bool,
    confirmation_sec : num,

    wish_role_rand_weight : num,
    wish_role_time        : num,

    first_night
    :obj({
        first_night_time : num,
        alert_times      : arr(num),
    }),

    day
    :obj({
        day_time       : num,
        reduction_time : num,
        alert_times      : arr(num),

        cut_time: union(
            literal('all' as const),
            literal('majority' as const),
        ),
    }),
    
    night
    :obj({
        length           : num,
        alert_times      : arr(num),
    }),

    after_game
    :obj({
        length           : num,
        alert_times      : arr(num),
    }),

    vote
    :obj({
        length         : num,
        alert_times    : arr(num),
        talk : bool,
        place: union(
            literal('realtime_open' as const),
            literal('realtime_anonym' as const),
            literal('realtime_anonym_open' as const),
            literal('after_open' as const),
            literal('after_anonym' as const),
            literal('no_open' as const),
        ),
        revote_num : num,
        when_even: union(
            literal('random' as const),
            literal('no_exec' as const),
        ),
    }),
});
export type RuleType = TsType<typeof RuleTypeFormat>;


export const ServerSettingsFormat = obj({

    system_lang     : str,
    token1          : str,
    token2          : str,
    auto_voice_link : bool,
    system_GM       : arr(str),
    
    http
    :obj({
        addr         : str,
        ip           : str,
        http_port    : str,
        template_dir : str,
        game_html    : str,
        white_list   : arr(str),
    }),
    se
    :obj({
        times : arr(tuple(num, str)),
        co    : str,
        call  : str,
    }),

    music
    :obj({
        opening     : str,
        first_night : str,
        day_time    : str,
        vote        : str,
        night       : str,
        good_win    : str,
        evil_win    : str,
    }),
});
export type ServerSettingsType = TsType<typeof ServerSettingsFormat>;
