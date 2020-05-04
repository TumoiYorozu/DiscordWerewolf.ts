#!/bin/sh
while true; do  
    cat ws.json  |  tr -d '\n' | tr -d '    ';
    echo;
    sleep 2
done