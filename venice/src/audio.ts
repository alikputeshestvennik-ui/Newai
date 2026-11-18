let audio:AudioContext|undefined;
let enabled=true;
export function setSound(value:boolean){ enabled=value; if(!value)void audio?.suspend(); }
export function wake(){if(enabled){audio??=new AudioContext();void audio.resume().catch(()=>{});}}
export function play(cue:'tick'|'water'|'gong'|'clue') {
  if(!enabled||!audio||audio.state!=='running')return;
  const now=audio.currentTime;
  const tone=(frequency:number,length:number,volume:number,delay=0)=>{
    const osc=audio!.createOscillator(),gain=audio!.createGain(),start=now+delay;
    osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(volume,start+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    osc.connect(gain);gain.connect(audio!.destination);osc.start(start);osc.stop(start+length);
  };
  if(cue==='gong'){[164,337,472,723].forEach((f,i)=>tone(f,2.4-i*.3,.12/(i+1)));return;}
  if(cue==='clue'){tone(440,.40,.055);tone(659,.8,.06,.13);return;}
  if(cue==='tick'){tone(1250,.036,.03);return;}
  const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.31),audio.sampleRate);
  const samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,3);
  const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  noise.buffer=buffer;filter.type='bandpass';filter.frequency.value=1300;gain.gain.value=.18;
  noise.connect(filter);filter.connect(gain);gain.connect(audio.destination);noise.start();
}
