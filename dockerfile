FROM alpine:3.11

RUN apk update && \
 apk add ffmpeg=4.2.1-r3 \
    nodejs=12.15.0-r1 \
    npm=12.15.0-r1 \
    git=2.24.3-r0 \
    wget=1.20.3-r0 \
    python=2.7.18-r0 \
    make=4.2.1-r2 \
    g++=9.2.0-r4

RUN npm i -g npm@6.12

RUN git clone https://github.com/TumoiYorozu/DiscordWerewolf.ts.git

WORKDIR /DiscordWerewolf.ts
RUN npm ci

# npm run prepareがなぜか実行しないので無理やり実行
RUN cd /DiscordWerewolf.ts/node_modules/ts-json-validator && npm install && npm run prepare

RUN npx typescript

RUN sh ./misc_tools/setFreeBGM/set_dova_syndrome_BGMs.sh

CMD ["/usr/bin/node", "build/index.js", "-s", "server_settings/dova_syndrome_BGMs.json5"] 