import * as Discord from "discord.js";
import {GameChannels} from "./GameUtils"
import {LangType, RuleType} from "./JsonType";
import {HttpGameState} from "./HttpServer"
import {Readable} from "stream";
import * as Prism from "prism-media";
import * as AudioMixer from "audio-mixer";
import * as fs from "fs"
import * as wav from "wav"

import {
    joinVoiceChannel, VoiceConnection,
    createAudioPlayer, createAudioResource,
    NoSubscriberBehavior, StreamType,
    EndBehaviorType,
} from "@discordjs/voice";

class RealtimeWaveStream extends Readable{
    freq       : number = 375;
    amp        : number = 1024;
    bitDepth   : number = 16;
    channels   : number = 2;
    sampleRate : number = 48000;
    buf        : Buffer = Buffer.alloc(0);
    base_numSamples  : number = 0;
    interval_ms      : number = 0;
    samplesGenerated : number = 0;
    next_time        : number = 0;

    constructor(amp : number) {
        super({objectMode: true});
        this.amp = amp;
        this.makeBuf(16384);
        this.reset();
    }
    reset(){
        this.next_time = Date.now() + this.interval_ms;
    }
    makeBuf(base_n : number){
        let sampleSize = this.bitDepth / 8;
		let blockAlign = sampleSize * this.channels;
		let numSamples = base_n / blockAlign | 0;
        this.buf = Buffer.alloc(numSamples * blockAlign);

        this.base_numSamples = numSamples;
        this.interval_ms = 1000 * numSamples / this.sampleRate;

        let t = (Math.PI * 2 * this.freq) / this.sampleRate;

		for (let i = 0; i < numSamples; i++) {
			// fill with a simple sine wave at max amplitude
			for (let channel = 0; channel < this.channels; channel++) {
				let s = this.samplesGenerated + i;
				let val = Math.round(this.amp * Math.sin(t * s)); // sine wave
                let offset = (i * sampleSize * this.channels) + (channel * sampleSize);
                if(this.bitDepth == 16){
                    this.buf.writeInt16LE(val, offset);
                }else if(this.bitDepth == 8){
                    this.buf.writeInt8(val, offset);
                }else if(this.bitDepth == 32){
                    this.buf.writeInt32LE(val, offset);
                }
			}
        }
    }
    _read(size : number) {
        const buf = this.buf;
        const dif = this.next_time - Date.now();
        setTimeout(() => {
            //this.next_time = Date.now() + this.interval_ms;
            this.next_time += this.interval_ms;
            this.push(buf);
            // this.samplesGenerated += this.base_numSamples;
            // console.log("read", size, " samplesGenerated", this.samplesGenerated)
		    //  if (this.samplesGenerated >= this.sampleRate * duration) {
		    //  	// after generating "duration" second of audio, emit "end"
		    //  	this.push(null);
            //  }
        }, dif);
    }
}


class RealtimeFsWavStream extends Readable{
    opend       : boolean = false;
    rateUnknown : boolean = true;
    interval_ms : number = 16384 * 1000 / 192000; // = 85.333[ms]
    chunkSize   : number = 20480; //  192000[Byte/sec]
    next_time   : number = 0;
    constructor(fname : string, wreader : wav.Reader) {
        super({
          objectMode: true
        });
        const fst = fs.createReadStream(fname);
        const dummyThis = this;
        fst.on("error", (e) => {
            console.log(e);
        })
        fst.on("readable", () =>{
            if(dummyThis.opend) return;
            dummyThis.opend = true;
            dummyThis.next_time = Date.now();
            const func = () =>{
                const b = fst.read(dummyThis.chunkSize);
                dummyThis.push(b);
                if(dummyThis.destroyed) {
                    fst.close();
                }else if(dummyThis.rateUnknown){
                    const r = wreader as any;
                    if("byteRate" in r){
                        const rate = r.byteRate;
                        if(typeof(rate) === 'number' &&  rate > 0){
                            console.log("rate : ", rate);
                            dummyThis.setRate(rate);
                            dummyThis.rateUnknown = false;
                        }
                    }
                    if(b !== null){
                        func();
                    }
                } else {
                    if(b !== null){
                        dummyThis.next_time += dummyThis.interval_ms;
                        setTimeout(func, dummyThis.next_time - Date.now());
                    }
                }
            };
            setTimeout(func, 0);
        });
    }
    setRate(r : number){
        this.chunkSize = r * this.interval_ms / 1000;
    }
    _read(size : number) {
    }
}



export default class LiveStream {
    channels  : GameChannels;
    channels2 : GameChannels;
    guild        : Discord.Guild;
    guild2       : Discord.Guild;
    liveMixer   : AudioMixer.Mixer | null = null;
    audioMixer  : AudioMixer.Mixer | null = null;
    dummyInput1  : AudioMixer.Input | null = null;
    conn1        : VoiceConnection  | null = null;
    conn2        : VoiceConnection  | null = null;
    bgmInput     : AudioMixer.Input | null = null;
    bgmInput2    : AudioMixer.Input | null = null;
    bgmFile      : RealtimeFsWavStream | null = null;
    bgmFileName  : string = "";
    bgmId        : number = 0;
    httpGameState   : HttpGameState;
    constructor(ch : GameChannels, ch2 : GameChannels, httpGameState : HttpGameState, SrvLangTxt : LangType, SrvRoleSetting : RuleType, guild : Discord.Guild, guild2 : Discord.Guild) {
        this.channels = ch
        this.channels2 = ch2
        this.httpGameState = httpGameState;
        this.guild = guild;
        this.guild2 = guild2;
    }
    reset(){}
    destroy(){
        if(this.liveMixer  ) this.liveMixer.destroy();
        if(this.audioMixer ) this.audioMixer.destroy();
        if(this.dummyInput1) this.dummyInput1.destroy();
        if(this.conn1      ) this.conn1.disconnect();
        if(this.conn2      ) this.conn2.disconnect();
        if(this.bgmInput   ) this.bgmInput.destroy();
        if(this.bgmInput2  ) this.bgmInput2.destroy();
        if(this.bgmFile    ) this.bgmFile.destroy();
        this.liveMixer = null  
        this.audioMixer = null 
        this.dummyInput1 = null
        this.conn1 = null      
        this.conn2 = null      
        this.bgmInput = null   
        this.bgmInput2 = null  
        this.bgmFile = null
    }
    loopBGM(name : string, bid : number, obj : LiveStream){
        if(name == obj.bgmFileName){
            obj.setBGM(name);
        }
    }
    setBGM(name : string){
        console.log("setBGM", name);
        if(this.liveMixer == null) return;
        if(this.audioMixer == null) return;
        if(this.bgmInput  != null) {
            this.liveMixer.removeInput(this.bgmInput)
            this.bgmInput = null;
        }
        if(this.bgmFile  != null) {
            this.bgmFile.destroy();
        }
        if(name == "") return;

        this.bgmInput = new AudioMixer.Input({
            channels: 2, bitDepth: 16,
            sampleRate: 48000, volume    : 5
        });
        this.liveMixer.addInput(this.bgmInput);


        const bid = Math.floor(Math.random() * 0x40000000) + 1;
        this.bgmFileName = name;
        this.bgmId = bid;
        const dummyThis = this;
        
        const bgmReader = new wav.Reader()
        const bgmFile = new RealtimeFsWavStream(name, bgmReader);
        this.bgmFile = bgmFile;

        bgmReader.on('readable', () => {
            dummyThis.loopBGM(name, bid, dummyThis);
        });
        bgmReader.on('format', () => {
            if(this.bgmInput  == null) return;
            bgmReader.pipe(this.bgmInput);
        });
        bgmFile.pipe(bgmReader);
        const sleep = (msec : number) => new Promise(resolve => setTimeout(resolve, msec));
    }
    playSe(name : string){
        if(this.liveMixer == null) return;

        const seWavReader = new wav.Reader()
        const fst = new RealtimeFsWavStream(name, seWavReader);
        // const fst = fs.createReadStream(name);
        fst.on("error", (e) => {
            console.log(e);
        })
        fst.pipe(seWavReader);
        console.log("play SE", name);
        seWavReader.once('readable', ()=>{
            const r = seWavReader as any;
            const channels   = r.channels;
            const sampleRate = r.sampleRate;
            const bitDepth   = r.bitDepth
            const lenMs        = r.chunkSize * 1000 / r.byteRate;
            if(channels == null || sampleRate == null || bitDepth == null || lenMs == null) return;
            if(this.liveMixer == null) return;
            const seInput = new AudioMixer.Input({
                channels: channels, bitDepth: bitDepth, sampleRate: sampleRate, volume : 100
            });
            seWavReader.pipe(seInput);
            this.liveMixer.addInput(seInput);

            setTimeout(()=>{
                if(this.liveMixer == null) return;
                this.liveMixer.removeInput(seInput);
                const m : any = this.liveMixer;
                console.log("se fin", m.inputs.length);
            }, lenMs);
        })
    }
    async connectVoice() {
        if(this.dummyInput1 != null) return false;
        if(this.liveMixer != null) return false;
        if(this.audioMixer != null) return false;
        if(this.conn1 != null) return false;
        if(this.conn2 != null) return false;

        const conn2 = joinVoiceChannel({
            guildId: this.channels2.DeadVoice.guildId,
            channelId: this.channels2.DeadVoice.id,
            adapterCreator: this.guild2.voiceAdapterCreator,
            selfMute: false,
        });
        if(conn2 == null) return false;
        this.conn2 = conn2;

        const mixer =  new AudioMixer.Mixer({
            channels: 2,
            bitDepth: 16,
            sampleRate: 48000
        });
        const player2 = createAudioPlayer({behaviors: {noSubscriber: NoSubscriberBehavior.Play}});
        conn2.subscribe(player2);
        const resource2 = createAudioResource((mixer as unknown as Readable), {
            inputType: StreamType.Raw
        });
        player2.play(resource2);

        this.audioMixer =  mixer;

        /////////////////////////////////////////////////////////////////////////
        const conn1 = joinVoiceChannel({
            guildId: this.channels.LivingVoice.guildId,
            channelId: this.channels.LivingVoice.id,
            adapterCreator: this.guild.voiceAdapterCreator,
            group: "1",
            selfDeaf : false,
            selfMute: false,
        });
        if(conn1 == null) return false;
        this.conn1 = conn1;

        this.liveMixer =  new AudioMixer.Mixer({
            channels: 2, bitDepth: 16, sampleRate: 48000
        });

         
        const player1 = createAudioPlayer({behaviors: {noSubscriber: NoSubscriberBehavior.Play}});
        conn1.subscribe(player1);
        const resource1 = createAudioResource((this.liveMixer as unknown as Readable), {
            inputType: StreamType.Raw
        });
        player1.play(resource1);

        const dummyInput1 = new AudioMixer.Input({
            channels: 2, bitDepth: 16, sampleRate: 48000, volume : 100
        });
        this.dummyInput1 = dummyInput1;
        this.liveMixer.addInput(dummyInput1);
        const dummyStream1 = new RealtimeWaveStream(0);
        dummyStream1.pipe(dummyInput1);

        
        this.bgmInput2 = new AudioMixer.Input({
            channels: 2, bitDepth: 16, sampleRate: 48000, volume    : 100
        });
        mixer.addInput(this.bgmInput2);
        this.liveMixer.pipe(this.bgmInput2);

        conn1.receiver.speaking.on("start", (userId) => {
            // console.log(  `${userId} start`  );
            this.httpGameState.updateMemberSpeaking(userId);
            if (this.audioMixer == null){
                console.log("audioMixer is null");
            } else {
                const audioStream = conn1.receiver.subscribe(userId, {
                    end: {
                        behavior: EndBehaviorType.AfterSilence,
                        duration: 100,
                    },
                });
                const standaloneInput = new AudioMixer.Input({
                    channels: 2,
                    bitDepth: 16,
                    sampleRate: 48000,
                    volume    : 80
                });
                this.audioMixer.addInput(standaloneInput);

                const opus_decoder = new Prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
                const p = audioStream.pipe(opus_decoder).pipe(standaloneInput);
                
                audioStream.on("error", e => {
                    console.error("audioStream Err", e);
                })
                opus_decoder.on("error", e => {
                    console.error("opus_decoder Err", e);
                })
                standaloneInput.on("error", e => {
                    console.error("standaloneInput Err", e);
                })
                p.on("error", e => {
                    console.error("p Err", e);
                })


                audioStream.on('end', () => {
                    if (this.audioMixer != null){
                        this.audioMixer.removeInput(standaloneInput);
                        this.httpGameState.updateMemberNospeaking(userId);
                        // console.log(`I'm no longer listening to ${userId}`);
                        opus_decoder.destroy();
                        standaloneInput.destroy();
                        audioStream.destroy();
                        p.destroy()
                    }
                });
                // audioStream.on('end', () => {
                //     console.log(`I'm no longer listening to ${userId}`);
                //     audioStream.destroy();
                // });
            }
        });

        return true;
    }
    unconnectVoice(){
        if(this.dummyInput1  != null) {
            this.dummyInput1.end();
            this.dummyInput1.destroy();
            this.dummyInput1 = null;
        }
        if(this.audioMixer != null){
            this.audioMixer.close();
            this.audioMixer = null;
        } 
        if(this.liveMixer != null){
            this.liveMixer.close();
            this.liveMixer = null;
        } 
        if(this.conn1 != null) {
            // this.conn1.on('closing', () => {
            //     this.conn1 = null;
            // });
            this.conn1.disconnect();
        }
        if(this.conn2 != null){
            // this.conn2.on('closing', () => {
            //     this.conn2 = null;
            // });
            this.conn2.disconnect();
        }
    }
}
