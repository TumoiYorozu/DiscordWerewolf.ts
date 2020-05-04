#!/bin/sh -x

# run  "sh set_dova_syndrome_BGMs.sh"

BGM_PATH=../../media/dova_syndrome_BGMs

rm *.mp3*
rm *.wav*
wget https://dova3.heteml.jp/dova/mp3/12610.mp3 &&
wget https://dova3.heteml.jp/dova/mp3/12589.mp3 &&
wget https://dova3.heteml.jp/dova/mp3/12665.mp3 &&
wget https://dova3.heteml.jp/dova/mp3/12409.mp3 &&
wget https://dova3.heteml.jp/dova/mp3/5248.mp3  &&

ffmpeg -y -i 12610.mp3 -ar 48000 12610.wav &&
ffmpeg -y -i 12589.mp3 -ar 48000 12589.wav &&
ffmpeg -y -i 12665.mp3 -ar 48000 12665.wav &&
ffmpeg -y -i 12409.mp3 -ar 48000 12409.wav &&
ffmpeg -y -i  5248.mp3 -ar 48000 5248.wav &&

mkdir -p $BGM_PATH  && 
mv *.wav $BGM_PATH/ && 
rm *.mp3* &&

JSON=$(cat << EOS
{
  music :{
    opening     : "./media/dova_syndrome_BGMs/12610.wav",
    first_night : "./media/dova_syndrome_BGMs/12589.wav",
    day_time    : "./media/dova_syndrome_BGMs/5248.wav",
    vote        : "./media/dova_syndrome_BGMs/12665.wav",
    night       : "./media/dova_syndrome_BGMs/12589.wav",
    good_win    : "./media/dova_syndrome_BGMs/12409.wav",
    evil_win    : "./media/dova_syndrome_BGMs/12610.wav",
  },
}
EOS
)

echo "$JSON" > ../../server_settings/dova_syndrome_BGMs.json5

echo "DONE!"
echo "Please run 'node build/index.js -s server_settings/dova_syndrome_BGMs.json5'"
