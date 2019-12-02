/**
 * The man. The myth. The legend of Blackwood.
 * The ultimate Rael Palmer Baker Slack bot.
 * 
 * raelbot v3.0
 * > Author: James Michael
 * > Created: November 2019
 */

const SlackBot = require('slackbots');
const express = require('express');
const latestTweets = require('latest-tweets');
const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const Base64 = require('js-base64').Base64;
const puppeteer = require('puppeteer');
const cron = require("node-cron");
const chalk = require('chalk');
const winston = require('winston');
const winstonDailyRotateFile = require('winston-daily-rotate-file');
const log_format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf(
        log => {
            let format;
            if (log.level === 'info') {
                format = `${log.timestamp} ${chalk.black.bgGreen(`[${log.level}]`)} ${log.message}`;
            } else if (log.level === 'error') {
                format = `${log.timestamp} ${chalk.white.bgRed(`[${log.level}]`)} ${log.message}`;
            } else if (log.level === 'warn') {
                format = `${log.timestamp} ${chalk.black.bgYellow(`[${log.level}]`)} ${log.message}`; 
            }
            return format;
        }
    ),
);
winston.loggers.add('logger', {
    format: log_format,
    transports: [
        new winstonDailyRotateFile({ 
            filename: './logs/raelbot.log' 
        }),
        new winston.transports.Console(),
    ]
});

const log = winston.loggers.get('logger');

const slack_credentials = require('./keys/slack');
const zendesk_credentials = require('./keys/zendesk');
const bamboo_credentials = require('./keys/bamboohr');
const trello_credentials = require('./keys/trello');
const foursquare_credentials = require('./keys/foursquare');

const endpoints = require('./helpers/api_endpoints');
const jackdaw = require('./helpers/jackdaw');
const loubot_quotes = require('./helpers/loubot_quotes');
const taylor_songs = require('./helpers/taylor_songs');
const rael_messages = require('./helpers/rael_messages');
const drinks = require('./helpers/rael_drinks');
const greetings = require('./helpers/greetings');

// initialize the bot.
const bot = new SlackBot(slack_credentials);
let params;

const app = express();
app.use(express.json());

let spotify_credentials = {
    access_token: null,
    refresh_token: null,
    user: null
};

let spotify_request_status = {
    pending: false,
    url: null,
};

// set up various message patterns.
const loubot_pattern = /initiate loubot/;
const spendesk_pattern = /latest|update|status|happening|news/;
const requested_quote_pattern = /give|please|pls|say a|random/;
const greetings_pattern = /hello|hi|yo|hey|shallom|bonjour|woof|ite|ola/;
const cloudia_pattern = /<@UER3Q7U4E>|who is your favourite|who do you like|favourite person/;
const rael_just_said_pattern = /rael just said/;
const zendesk_pattern = /zendesk|tickets|new queue/;
const joke_pattern = /tell me a joke|a joke please|tell us a joke/;
const asda_pattern = /asda/;
const tinder_pattern = /tinder/;
const dance_pattern = /dance/;
const drink_pattern = /favourite drink/;
const image_pattern = /random image/;
const feature_pattern = /feature request/;
const clarify_pattern = /who are you/;
const team_pattern = /favourite team/;
const lobster_pattern = /scrappy doo lobster/;
const time_remaining_pattern = /how long left|how long is left/;
const help_pattern = /\/help/;
const owo_pattern = /owo/;
const pubs_pattern = /what pub should we go to/;
const affection_pattern = /love you/;
const chonker_pattern = /random chonker|big chungus/;
const tag_pattern = /check for tag/;
const whos_out_pattern = /whos out|who is out|who\’s out/;
const trello_pattern = /trello|qa status|qa update/;

const whitelisted_channels = /GDYFAL0HJ|CD2FKB621|GB7LT0TKK|DP07UQJD8|DPFFK0287|DQ2SNH0L9|GQ9QLM4NN|GQRJ5NPDH/;
const whitelisted_users = /U9C81JU91/;

const spotify_pattern = /play|dj|what song is this|next song|previous song|spotify status|shuffle|change volume to|christmas party playlist/;
const spotify_channels = /GB7LT0TKK|CD2FKB621|DP07UQJD8|GQ9QLM4NN|GQRJ5NPDH/;
const christmas_playlist_id_old = '0vXdwTD04TCEivqsMnj0oM';
const christmas_playlist_id = '1KfvD9bvlMA1xlH5zrF28B';
const rael_playlist_id = '0BOcBAiGEypv5rcKggfP0J';

const foursquare_pubs_id = '4bf58dd8d48988d11b941735';

// keep track (globally) of the number of quotes requested per day.
let requested_quote_status = {
    count: 0,
    date: null
};

bot.on('error', error => log.error(`[init] ${error}`));

bot.on('message', (data) => {
    // if the incoming event is not a message, if it's from a bot, or if it has no text, do nothing.
    if (data.type !== 'message' || data.subtype === 'bot_message' || !data.text) {
        return;
    }

    // ensure incoming message includes '@raelbot'.
    if (data.text.includes('<@UPD1FRQGM>')) {
        // ensure the incoming message is from a whitelisted channel.
        if (data.channel.match(whitelisted_channels)) {
            params = {};
            log.info(`[init] new message received...\n${JSON.stringify({ user: data.user, channel: data.channel, ts: data.ts, text: data.text }, null, 4)}`);

            // speak to ral when he sends a message.
            if (data.user === 'UBZA4KPKP') {
                let message = rael_messages[Math.floor(Math.random() * rael_messages.length)];
                log.info(`[init] message is from Rael Palmer Baker -- acknowledging with message '${message}'...`);
                bot.postMessage(data.channel, `<@UBZA4KPKP> ${message}`, params);
            }

            let message_text = data.text.toLowerCase();

            if (message_text.match(loubot_pattern)) initiate_loubot(data);

            // if raelbot is waiting for a response, it will be prioritised above anything else.
            if (spotify_request_status.pending) {
                handle_spotify_playlist_add(data, christmas_playlist_id, true);
                return;
            }

            // any spotify requests must come from a whitelisted channel, otherwise functionality is disabled.
            if (message_text.match(spotify_pattern)) {
                if (data.channel.match(spotify_channels)) {
                    handle_initial_spotify_request(data, message_text);
                    return;
                } else {
                    bot.postMessage(data.channel, `<@${data.user}> please use this feature in a whitelisted channel... :male-detective:`, params);
                }
            }

            if (message_text.match(/spendesk/) && message_text.match(spendesk_pattern)) provide_spendesk_update(data);
            else if (message_text.match(/quote/) && message_text.match(requested_quote_pattern)) handle_quote_request(data);
            // else if (message_text.match(fact_pattern)) handle_random_fact(data);
            else if (message_text.match((help_pattern))) help(data);
            else if (message_text.match(tag_pattern)) conduct_tag_check(data);
            else if (message_text.match(team_pattern)) handle_favourite_team(data);
            else if (message_text.match(dance_pattern)) dance(data);
            else if (message_text.match(rael_just_said_pattern)) handle_quote_add(data);
            else if (message_text.match(zendesk_pattern)) provide_zendesk_update(data);
            else if (message_text.match(joke_pattern)) tell_joke(data);
            else if (message_text.match(asda_pattern)) handle_asda_message(data);
            else if (message_text.match(tinder_pattern)) provide_tinder_update(data);
            else if (message_text.match(time_remaining_pattern)) show_time_remaining(data);
            else if (message_text.match(drink_pattern)) handle_favourite_drink(data);
            else if (message_text.match(affection_pattern)) handle_affection(data);
            else if (message_text.match(owo_pattern)) owo(data);
            else if (message_text.match(feature_pattern)) handle_feature_request(data);
            else if (message_text.match(cloudia_pattern)) handle_cloudia_message(data);
            else if (message_text.match(clarify_pattern)) clarify_self(data); 
            else if (message_text.match(pubs_pattern)) suggest_random_pub(data);
            else if (message_text.match(image_pattern)) show_random_image(data);
            else if (message_text.match(lobster_pattern)) show_random_image(data, true); 
            else if (message_text.match(whos_out_pattern)) handle_bamboo_ooo(data);
            else if (message_text.match(trello_pattern)) handle_trello_update(data);
            else if (message_text.match(chonker_pattern)) share_random_chonker(data);
            else if (message_text.match(greetings_pattern)) issue_greeting(data);
        } else {
            log.warn(`[init] new message received from a non-whitelisted channel...\n${JSON.stringify({ user: data.user, channel: data.channel, ts: data.ts, text: data.text }, null, 4)}`);
        }
    }
});

/**
 * all spotify requests are initially handled here.
 * the appropriate function is called depending on what the user has requested.
 */
const handle_initial_spotify_request = (data, message_text) => {
    log.info('[spotify] [handle_initial_spotify_request] received a spotify request...');

    params = {
        username: 'dj raelbot'
    };
    if (message_text.match(/play something rael will enjoy/)) handle_spotify_dj(data, rael_playlist_id);
    else if (message_text.match(/play christmas party playlist/)) handle_spotify_dj(data, christmas_playlist_id);
    else if (message_text.match(/show christmas party playlist/)) show_spotify_playlist(data, christmas_playlist_id);
    else if (message_text.match(/add /) && message_text.match(/christmas party playlist/)) handle_spotify_playlist_add(data, christmas_playlist_id);
    else if (message_text.match(/play /)) play_spotify_track(data);
    else if (message_text.match(/dj/)) handle_spotify_dj(data);
    else if (message_text.match(/what song is this/)) show_spotify_track_status(data);
    else if (message_text.match(/next song|previous song/)) handle_spotify_track_skip(data);
    else if (message_text.match(/enable shuffle|disable shuffle/)) toggle_spotify_shuffle(data);
    else if (message_text.match(/change volume to/)) adjust_spotify_volume(data);
    else if (message_text.match(/spotify status/)) show_spotify_status(data);
    return;
};

/**
 * [usage: '@raelbot spotify status']
 * tells the user whether spotify is currently authenticated or not.
 * @param data - the message received from the user.
 */
const show_spotify_status = data => {
    log.info('[spotify] [show_spotify_status] showing spotify status...');

    if (spotify_credentials.access_token) {
        bot.postMessage(data.channel, `<@${data.user}> spotify is currently authenticated as *${spotify_credentials.user}*`, params);
    } else {
        bot.postMessage(data.channel, `<@${data.user}> spotify is not authenticated`, params);
    }
};

/**
 * used across spotify playback functions.
 * will search for a track, album or playlist - depending on the provided request.
 * @param query - the search query to use.
 * @param type - the type of search (track, album or playlist).
 * @returns results if the request was successful.
 */
const handle_spotify_search = async (query, type) => {
    log.info(`[spotify] [handle_spotify_search] searching for ${type}: '${query}'...`);

    try {
        let response = await axios.get(`${endpoints.spotify_search}?q=${encodeURIComponent(query)}&type=${type}`,
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });
        
        let results;
        if (type === 'track') {
            results = response.data.tracks;
        } else if (type === 'album') {
            results = response.data.albums;
        } else if (type === 'playlist') {
            results = response.data.playlists;
        }

        let results_obj = {
            name: results.items[0].name,
            url: results.items[0].external_urls.spotify,
            uri: results.items[0].uri
        }

        if (type === 'track' || type === 'album') {
            results_obj['artist'] = results.items[0].artists[0].name;
        }

        log.info(`[spotify] [handle_spotify_search] search returned the following result:\n${JSON.stringify(results_obj, null, 4)}`);
        
        return results_obj;
    } catch (error) {
        if (error.response) {
            log.error(`[spotify] [handle_spotify_search] ${error.response.status} - ${error.response.statusText}`);
            
            if (error.response.status === 401) {
                return false;
            }
        } else {
            log.error(`[spotify] [handle_spotify_search] ${error}`);
        }
    }
};

/**
 * [usage: '@raelbot play [request]']
 * plays an individual track.
 * there's a chance the request is refused and overwritten with a random taylor swift song.
 * @param data - the message received from the user.
 */
const play_spotify_track = async data => {
    log.info(`[spotify] [play_spotify_track] preparing to play track...`);

    let request = data.text.split('play ')[1].replace(' by ',' ');
    let random = Math.floor(Math.random()*1000);

    log.info(`[spotify] [play_spotify_track] track request: '${request}'...`);

    if (request.match(/taylor swift/)) {
        log.info(`[spotify] [play_spotify_track] taylor request detected...`);
        bot.postMessage(data.channel, `<@${data.user}> YASSSSS TAYLOR SLAY QUEEN :raised_hands:`, params);
    } else if (request.match(/teenagers/)) {
        log.info(`[spotify] [play_spotify_track] teenagers detected, refusing request...`);
        bot.postMessage(data.channel, `<@${data.user}> nah.`, params);
        return;
    } else if (random > 300 && random < 350) {    
        log.info(`[spotify] [play_spotify_track] switching to taylor-mode...`);
        bot.postMessage(data.channel, `<@${data.user}> i'd much rather play some Taylor! QUEEEEEEEEEEEEEEN. :raised_hands:`, params);
        request = taylor_songs[Math.floor(Math.random()*taylor_songs.length)]
    }

    let play_obj = await handle_spotify_search(request, 'track');

    try {
        await axios.put(endpoints.spotify_play,
        {
            "uris": [play_obj.uri]
        },
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });

        setTimeout(() => { show_spotify_track_status(data, true); }, 750);
    } catch (error) {
        if (error.response) {
            log.error(`[spotify] [play_spotify_track] ${error.response.status} - ${error.response.statusText}`);
            
            if (error.response.status === 401) {
                return false;
            }
        } else {
            log.error(`[spotify] [play_spotify_track] ${error}`);
        }
    }
};

/**
 * [usage: '@raelbot dj (album) [request]']
 * handles the streaming of a playlist or album.
 * a playlist id can be passed to play a specific playlist. useful if requesting a private playlist.
 * @param data - the message from the user.
 * @param id - (optional) a specific playlist id.
 */
const handle_spotify_dj = async (data, id) => {
    log.info(`[spotify] [handle_spotify_dj] preparing to dj...`);

    let play_obj;
    let type = 'playlist';

    if (!id) {
        let request = data.text.toLowerCase().split('dj ')[1];
        
        if (request.match(/album /)) {
            type = 'album';
            request = request.split('album ')[1];
            if (request.match(/ by /)) {
                request = `album:${request.split(' by ')[0]} artist:${request.split(' by ')[1]}`;
            } else {
                request = `album:${request}`; 
            }
        } 
    
        log.info(`[spotify] [handle_spotify_dj] ${type} request: '${request}'...`);
    
        if (request.match(/taylor swift/)) {
            log.info(`[spotify] [handle_spotify_dj] taylor detected...`);
            bot.postMessage(data.channel, `<@${data.user}> YASSSSS TAYLOR SLAY QUEEN :raised_hands:`, params);
        } 
        
        play_obj = await handle_spotify_search(request, type);
    } else {
        play_obj = await get_spotify_playlist(id);
    }

    try {
        await axios.put(endpoints.spotify_play,
        {
            "context_uri": play_obj.uri
        },
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });

        log.info(`[spotify] [handle_spotify_dj] playing ${type} '${play_obj.name}'...`);

        bot.postMessage(data.channel, `:rael-confused: :speech_balloon: "now streaming ${type} *<${play_obj.url}|${play_obj.name}>*${type === 'album' ? ` by *${play_obj.artist}*` : ''}..." :speaker: :musical_note: :gangstas-paraldise:`, params);
        setTimeout(() => { show_spotify_track_status(data, true); }, 2000);
    } catch (error) {
        if (error.response) {
            log.error(`[spotify] [handle_spotify_dj] ${error.response.status} - ${error.response.statusText}`);

            if (error.response.status === 401) {
                handle_spotify_logout();
                bot.postMessage(data.channel, `<@${data.user}> please authenticate and try again...`, params);
            } else if (error.response.statusText == 'Not Found') {
                bot.postMessage(data.channel, `<@${data.user}> sorry, something went wrong :face_with_head_bandage:\n\`${error}\``, params);
            }
        } else {
            log.error(`[spotify] [handle_spotify_dj] ${error}`);
            bot.postMessage(data.channel, `:face_with_head_bandage:\n\`${error}\``, params);
        }
    }
};

/**
 * shows information about the track currently being played.
 * @param data - the message received from the user.
 * @param basic - (optional) if true, the response will not contain any urls, album info or release dates.
 */
const show_spotify_track_status = async (data, basic) => {
    log.info(`[spotify] [show_spotify_track_status] showing track status...`);

    try {
        let response = await axios.get(endpoints.spotify_currently_playing,
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });

        let status = {
            artist: response.data.item.album.artists[0].name,
            year: response.data.item.album.release_date,
            album: response.data.item.album.name,
            track: response.data.item.name,
            url: response.data.item.external_urls.spotify
        };

        if (basic) {
            log.info(`[spotify] [show_spotify_track_status] basic formatting requested:\n${JSON.stringify(status, null, 4)}`);
            bot.postMessage(data.channel, `:rael-confused: :speech_balloon: "now playing *${status.track}* by *${status.artist}*..." :speaker: :musical_note: :gangstas-paraldise:`, params);
        } else {
            log.info(`[spotify] [show_spotify_track_status] full track info:\n${JSON.stringify(status, null, 4)}`);
            bot.postMessage(data.channel, `:speaker: :musical_note: :gangstas-paraldise: :musical_note: :speaker:\n> *Track:* <${status.url}|${status.track}>\n> *Artist:* ${status.artist}\n> *Album:* ${status.album}\n> *Released:* ${new Date(status.year).toDateString()}`, params);
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                handle_spotify_logout();
            }
            log.error(`[spotify] [show_spotify_track_status] ${error.response.status} - ${error.response.statusText}`);
        } else {
            log.error(`[spotify] [show_spotify_track_status] ${error}`);
        }
    }
};

/**
 * gets an individual playlist using a provided playlist id.
 * @param playlist_id - the playlist id.
 * @returns playlist info if the request was successful.
 */
const get_spotify_playlist = async playlist_id => {
    log.info(`[spotify] [get_spotify_playlist] getting requested playlist...`);

    try {
        let response = await axios.get(`${endpoints.spotify_playlist}/${playlist_id}`,
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });

        let playlist_obj = {
            name: response.data.name,
            url: response.data.external_urls.spotify,
            uri: response.data.uri
        };

        log.info(`[spotify] [get_spotify_playlist] found playlist:\n${JSON.stringify(playlist_obj, null, 4)}`);

        return playlist_obj;
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                handle_spotify_logout();
            }
            log.error(`[spotify] [get_spotify_playlist] ${error.response.status} - ${error.response.statusText}`);
        } else {
            log.error(`[spotify] [get_spotify_playlist] ${error}`);
        }
        return false;
    }
};

/**
 * [usage: '@raelbot show [playlist]']
 * shows a playlist, along with (maximum) 100 tracks it contains.
 * @param data - the message received from the user.
 * @param playlist_id - the playlist id.
 */
const show_spotify_playlist = async (data, playlist_id) => {
    log.info(`[spotify] [show_spotify_playlist] showing playlist...`);

    let playlist_obj = await get_spotify_playlist(playlist_id);
    log.info(`[spotify] [show_spotify_playlist] playlist: ${playlist_obj.name}...`);

    bot.postMessage(data.channel, `<@${data.user}> <${playlist_obj.url}|${playlist_obj.name}> :santa: :christmas_tree: :mother_christmas:`, params);
};

/**
 * [usage: '@raelbot add [request] to [playlist]']
 * add an individual track to a specified playlist.
 * raelbot will first search for the track and then prompt the user to confirm.
 * @param data - the message received from the user.
 * @param playlist_id - the playlist id.
 * @param confirm - (optional) if raelbot is waiting for confirmation of a request, this is required.
 */
const handle_spotify_playlist_add = async (data, playlist_id, confirm) => {
    if (!confirm) {
        let request = data.text.toLowerCase().split('add ')[1].replace(' to the christmas ', ' to christmas ').split(' to christmas')[0].replace(' by ', ' ').trim();
        let results = await handle_spotify_search(request, 'track');

        bot.postMessage(data.channel, `found *<${results.url}|${results.name}>* by *${results.artist}*...`, params);
        
        setTimeout(() => {
            bot.postMessage(data.channel, `<@${data.user}> is this correct?`, params);
        }, 2000);

        spotify_request_status.pending = true;
        spotify_request_status.uri = results.uri;
    } else {
        if (data.text.toLowerCase().match(/ yes/)) {
            try {
                await axios.post(`${endpoints.spotify_playlist}/${playlist_id}/tracks`,
                {
                    "uris": [spotify_request_status.uri]
                },
                {
                    headers: {
                        "Authorization": `Bearer ${spotify_credentials.access_token}`
                    }
                });

                bot.postMessage(data.channel, `<@${data.user}> song has been added! :santa: :christmas_tree: :mother_christmas:`, params);
            } catch (error) {
                console.log(error);
                if (error.response) {
                    bot.postMessage(data.channel, `:face_with_head_bandage:\n\`${error}\``, params);

                    log.error(`[spotify] [handle_spotify_playlist_add] ${error.response.status} - ${error.response.statusText}`);

                    if (error.response.status === 401) {
                        handle_spotify_logout();
                    }
                } else {
                    log.error(`[spotify] [handle_spotify_playlist_add] ${error}`);
                }
            }
        } else {
            bot.postMessage(data.channel, `<@${data.user}> ok, i won't add it :sad_cowboy:`, params);

            log.info(`[spotify] [handle_spotify_playlist_add] user decided against adding the returned track.`);
        }
        spotify_request_status.pending = false;
        spotify_request_status.pending.uri = null;
    }
};

/**
 * [usage: '@raelbot [enable/disable] shuffle']
 * toggle the shuffle status for playback.
 * @param data - the message received from the user.
 */
const toggle_spotify_shuffle = async data => {
    log.info(`[spotify] [toggle_spotify_shuffle] received request to toggle shuffle...`);

    let shuffle_status = false;
    if (data.text.match(/enable shuffle/)) {
        shuffle_status = true;
    }

    try {
        await axios.put(`${endpoints.spotify_shuffle}?state=${shuffle_status}`,
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });
    
        log.info(`[spotify] [toggle_spotify_shuffle] shuffle has been ${shuffle_status === true ? 'enabled' : 'disabled'}...`);

        bot.postMessage(data.channel, `<@${data.user}> shuffle has been ${shuffle_status === true ? 'enabled' : 'disabled'}...`, params);
    } catch (error) {
        console.log(error);
        if (error.response) {
            log.error(`[spotify] [toggle_spotify_shuffle] ${error.response.status} - ${error.response.statusText}`);

            if (error.response.status === 401) {
                handle_spotify_logout();
                bot.postMessage(data.channel, `<@${data.user}> please authenticate and try again...`, params);
            } 
        } else {
            log.error(`[spotify] [toggle_spotify_shuffle] ${error}`);
        }
    }
};

/**
 * [usage: '@raelbot change volume to [percentage]']
 * set the volume of playback to the requested level.
 * @param data - the message received from the user.
 */
const adjust_spotify_volume = async data => {
    log.info(`[spotify] [adjust_spotify_volume] received request to change volume...`);

    let volume_percentage = data.text.split(/change volume to /)[1].replace('%','').trim();

    try {
        await axios.put(`${endpoints.spotify_volume}?volume_percent=${volume_percentage}`,
        {
            headers: {
                "Authorization": `Bearer ${spotify_credentials.access_token}`
            }
        });
    
        log.info(`[spotify] [adjust_spotify_volume] volume has been changed to ${volume_percentage}%...`);

        bot.postMessage(data.channel, `<@${data.user}> done...`, params);
    } catch (error) {
        console.log(error);
        if (error.response) {
            log.error(`[spotify] [adjust_spotify_volume] ${error.response.status} - ${error.response.statusText}`);

            if (error.response.status === 401) {
                handle_spotify_logout();
                bot.postMessage(data.channel, `<@${data.user}> please authenticate and try again...`, params);
            } 
        } else {
            log.error(`[spotify] [adjust_spotify_volume] ${error}`);
        }
    }
};

/**
 * authenticates the spotify user logging in.
 * @param credentials - the credentials passed from authentication.
 */
const handle_spotify_login = credentials => {
    log.info(`[spotify] [handle_spotify_login] received authentication request...`);

    spotify_credentials.access_token = credentials.access_token;
    spotify_credentials.refresh_token = credentials.refresh_token;
    spotify_credentials.user = credentials.user;

    log.info(`[spotify] [handle_spotify_login] user successfully logged in as ${spotify_credentials.user}.`);
};

/**
 * removes the credentials of any spotify user currently logged in.
 */
const handle_spotify_logout = () => {
    log.info(`[spotify] [handle_spotify_logout] logging out user ${spotify_credentials.user}...`);
    
    spotify_credentials.access_token = null;
    spotify_credentials.refresh_token = null;
    spotify_credentials.user = null;

    log.info(`[spotify] [handle_spotify_logout] user has been successfully logged out.`);
};

/**
 *  initiates loubot and gives a random quote.
 * @param data - the message received from the user.
 */
const initiate_loubot = data => {
    log.info(`[initiate_loubot] handling request to initiate loubot...`);

    setTimeout(() => {
        params = {
            icon_emoji: ':louise:',
            username: 'loubot'
        };
        bot.postMessage(data.channel, `:speech_balloon: \`"${loubot_quotes[Math.floor(Math.random() * loubot_quotes.length)]}"\``, params);
        params = {};
    }, 1500)
    
    setTimeout(() => {
        bot.postMessage(data.channel, ':rael-lobster: :speech_balloon: "*woof* what was that???????" :flushed: :flushed:', params);
    }, 7500);

    setTimeout(() => {
        bot.postMessage(data.channel, ':face_with_head_bandage:', params);
        log.info(`[initiate_loubot] loubot request complete.`);
    }, 9000);
};

/**
 * [usage: '@raelbot please provide a spendesk update']
 * have raelbot fulfill rael's spendesk ambassadorial duties.
 * gets the latest tweet from the @spendesk twitter account -- doesn't include retweets.
 * @param data - the message received from the user.
 */
const provide_spendesk_update = data => {
    log.info(`[provide_spendesk_update] received request for a spendesk update...`);

    try {
        latestTweets('spendesk', function (err, tweets) {
            const response = tweets;
            let tweet;
            
            for (let t of response) {
                if (t.retweet === false) {
                    tweet = t;
                    break;
                }
            }

            if (tweet) {
                params = {
                    "attachments": [
                        {
                            "fallback": "raelbot",
                            "color": "#882100",
                            "title": `:rael-confused: \"here\'s the <${tweet.url}|latest update> from <https://twitter.com/Spendesk|@spendesk>...\" :mega:`,
                            "fields": [
                                {
                                    "value": `>>>${tweet.content}`
                                }
                            ],
                            "footer": `(*originally posted:* ${tweet.date.toLocaleString()})`
                        }
                    ]
                }
                bot.postMessage(data.channel, '', params);
                params = {};

                log.info(`[provide_spendesk_update] update given.`);
            }
        });
    } catch (error) {
        log.error(`[provide_spendesk_update] ${error}`);
    }
};

/**
 * [usage: '@raelbot random quote please']
 * posts a random quote. 
 * by default there is a limit of 3 per day - but can be overwritten by including 'NOW' in the request.
 * @param data - the message received from the user.
 */
const handle_quote_request = data => {
    log.info(`[handle_quote_request] received request for a random quote...`);

    try {
        let quotes = JSON.parse(fs.readFileSync('./helpers/quotes.json', 'utf8'));
        let random = Math.floor(Math.random() * quotes.length);
        let message;
        let date;
    
        if (requested_quote_status.count >= 3) {
            if (data.text.match(/NOW/)) {
                log.info(`[handle_quote_request] quote count is ${requested_quote_status.count}, forcing request...`);
                message = `:rael-confused: :speech_balloon:  \`\"${quotes[random].quote}\"\``;
            } else {
                date = new Date();
                if (date.getDate() < new Date(requested_quote_status.date).getDate()+1) {
                    log.info(`[handle_quote_request] daily quote limit exceeded...`);
                    bot.postMessage(data.channel, `<@${data.user}> there are only so many quotes! please try again tomorrow... :rael:`, params);
                    return;
                } else {
                    requested_quote_status.date = null;
                    requested_quote_status.count = 0;
                }
            }
        }
        
        if (quotes[random].consumed == false) {
            if (quotes[random].verified == false) {
                message = `:rael-confused: :speech_balloon:  \`\"${quotes[random].quote}\"\`\n_(submitted by <@${quotes[random].poster}>)_`;
            } else {
                if (quotes[random].context && quotes[random].context == true) {
                    message = `[_${quotes[random].context}_]\n:rael-confused: :speech_balloon:  \`\"${quotes[random].quote}\"\``;
                } else {
                    message = `:rael-confused: :speech_balloon:  \`\"${quotes[random].quote}\"\``;
                }
            }

            log.info(`[handle_quote_request] responding with message '${message}'...`);
            bot.postMessage(data.channel, message, params);

            requested_quote_status.count++;
            requested_quote_status.date = new Date().toISOString();
        }
    } catch (error) {
        log.error(`[handle_quote_request] ${error}`);
    }
};

/**
 * [usage: '@raelbot rael just said [quote]']
 * adds a new quote to the list on request. the user submitting is also stored.
 * @param data - the message from the user.
 */
const handle_quote_add = data => {
    log.info(`[handle_quote_add] received request to add a new quote to the list...`);

    try {
        let request = data.text.split('rael just said ')[1].trim().replace(/\"/g,'').replace(/\“/g,'').replace(/\”/g,'');
        let file = JSON.parse(fs.readFileSync('./helpers/quotes.json', 'utf8'));
        log.info(`[handle_quote_add] quote list has been read...`);

        let new_quote = {};
        new_quote['quote'] = request;
        new_quote['consumed'] = false;
        new_quote['verified'] = false;
        new_quote['poster'] = data.user;
        file.push(new_quote);

        fs.writeFileSync('./helpers/quotes.json', JSON.stringify(file, null, 4));
        
        log.info(`[handle_quote_add] new quote has been added and written to the list:\n${JSON.stringify(new_quote, null, 4)}`);

        bot.postMessage(data.channel, `<@${data.user}> classic rael! another one to add to the list... :rael: :rael-funsize: :rael-lobster:`, params);
    } catch (error) {
        log.error(`[handle_quote_add] ${error}`);
    }
};

/**
 * [usage: '@raelbot check for tag [site url]']
 * checks for CIQ/PPTM tags on a provided site.
 * initiates a headless browser, intercepts and analyses requests on load of the site homepage.
 * @param data - the message received from the user.
 */
const conduct_tag_check = async data => {
    log.info(`[conduct_tag_check] received request to check a site for tags...`);

    let pptm = 'not detected:heavy_exclamation_mark:';
    let ciq = 'not detected:heavy_exclamation_mark:';
    let platform = 'N/A';
    let tag_id = 'N/A';
    let pptm_id = 'N/A';
    let legacy = false;
    let site = data.text.split('check for tag ')[1].replace('<','').replace('>','');

    bot.postMessage(data.channel, `<@${data.user}> checking...`, params);  

    try {
        const browser = await puppeteer.launch({
            slowMo: 150,
            args: ['--window-size=1920,1080'],
        });
        log.info(`[conduct_tag_check] browser initialised...`);
    
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
    
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().match(/cloudiq|pptm|cloud-iq/)) {
                if (req.url().match(/cloudiq.com\/tag\//)) {
                    ciq = ':white_check_mark:';
                    if (req.url().match(/-eu-/)) {
                        platform = 'Aviary :flag-eu:';
                        tag_id = req.url().split(/tag\//)[1].split('.js')[0];
                    } else if (req.url().match(/-us-/)) {
                        platform = 'Beehive :flag-us:';
                        tag_id = req.url().split(/tag\//)[1].split('.js')[0];
                    } else if (req.url().match(/-apac-|-au-/)) {
                        platform = 'Corral :flag-au:'; 
                        tag_id = req.url().split(/tag\//)[1].split('.js')[0];
                    }

                    log.info(`[conduct_tag_check] new tag detected:\n${JSON.stringify({ platform: platform, tag_id: tag_id }, null, 4)}`);
                } else if (req.url().match(/\/tagmanager\/pptm.js/)) {
                    pptm = ':white_check_mark:';
                    pptm_id = req.url().split('pptm.js?id=')[1];
                    log.info(`[conduct_tag_check] pptm tag detected (${pptm_id})...`);
                } else if (req.url().match(/cloud-iq.com\/cartrecovery\/store.js|cloud-iq.com.au\/cartrecovery\/store.js/)) {
                    legacy = true;
                    ciq = ':white_check_mark:';
                    if (req.url().match(/cloud-iq.com.au/)) {
                        platform = req.url().split('.cloud-iq.com.au')[0].split('://')[1].replace('platform', 'prod') + ' AU :flag-au:'
                    } else {
                        platform = req.url().split('.cloud-iq.com')[0].split('://')[1].replace('platform', 'prod') + ' UK :uk:'
                    }
                    tag_id = req.url().split('app_id=')[1];

                    log.info(`[conduct_tag_check] legacy tag detected:\n${JSON.stringify({ platform: platform, tag_id: tag_id }, null, 4)}`);
                } 
                req.continue();
            } else {
                req.continue();
            }
        });
    
        log.info(`[conduct_tag_check] browser is navigating to ${site}...`);

        await page.goto(site, { waitUntil: 'networkidle2' });
        await browser.close();

        log.info(`[conduct_tag_check] browser analysis has finished.`);
    
        if (legacy) {
            bot.postMessage(data.channel, `<@${data.user}> :rael-lobster: here are the results for ${site}...\n> - *CIQ Tag:* ${ciq}\n> - *App ID:* ${tag_id}\n> - *Environment:* ${platform.replace('prod ','prod1 ')}`, params);  
        } else {
            bot.postMessage(data.channel, `<@${data.user}> :rael-lobster: here are the results for ${site}...\n> - *PPTM Tag:* ${pptm}\n> - *CIQ Tag:* ${ciq}\n> - *PPTM ID:* ${pptm_id}\n> - *Tag ID:* ${tag_id}\n> - *Environment:* ${platform}`, params);  
        }
    } catch (error) {
        log.error(`[conduct_tag_check] ${error}`);
    }
};

/**
 * [usage: '@raelbot what is your favourite team?']
 * raelbot is a big football fan.
 * @param data - the message received from the user.
 */
const handle_favourite_team = data => {
    log.info(`[handle_favourite_team] received favourite team request...`);
    bot.postMessage(data.channel, `<@${data.user}> GLORY GLORY MAN UNITED :heart:`, params);  
};

/**
 * [usage: '@raelbot dance']
 * @param data - the message from the user. 
 */
const dance = data => {
    log.info(`[dance] received request to dance...`);

    const dancing_ral = ':gangstas-paraldise:';

    let dance_string = '';
    for (var i=0;i<100;i++) {
        if (i % 10 == 0) dance_string += '\n';
        else dance_string += dancing_ral + ' ';
    }

    bot.postMessage(data.channel, dance_string, params);
};

/**
 * [usage: '@raelbot how many zendesk tickets?']
 * gives an update on the number of zendesk tickets currently in the new queue.
 * response includes ticket numbers, links and subjects.
 * @param data - the message received from the user. 
 */
const provide_zendesk_update = async data => {
    log.info(`[provide_zendesk_update] received zendesk update request...`);

    try {
        let response = await axios.get(endpoints.zendesk_new,  
        {
            headers: {
                Authorization: `Basic ${Base64.encode(zendesk_credentials.token)}`
            }
        });
    
        if (response) {
            let tickets = response.data.results;
            let field_array = [];
            let field;

            for (const t of tickets) {
                field = {
                    "value": `> [<${endpoints.zendesk_external}/${t.id}|#${t.id}>] \`${t.subject}\``
                };
                field_array.push(field);
            }

            params = {
                "attachments": [
                    {
                        "fallback": "raelbot",
                        "color": "#882100",
                        "title": `:rael-confused: :speech_balloon: "there are ${tickets.length} new zendesk tickets..."`,
                        "fields": field_array,
                    }
                ]
            }

            log.info(`[provide_zendesk_update] results returned ${tickets.length} new tickets...`);

            bot.postMessage(data.channel, '', params); 
            params = {}; 
        }
    } catch (error) {
        log.error(`[provide_zendesk_update] ${error}`);
    }
};

/**
 * [usage: '@raelbot tell us a joke']
 * tells a random (dad) joke.
 * @param data - the message received from the user.
 */
const tell_joke = async data => {
    log.info(`[tell_joke] getting a joke...`);

    try {
        let response = await axios.get(endpoints.random_joke,
        {
            headers: {
                Accept: 'text/plain'
            }
        });

        log.info(`[tell_joke] telling joke '${response.data}'...`);
        bot.postMessage(data.channel, `:rael-confused: :speech_balloon: \`"${response.data.toLowerCase()}"\` :drum_with_drumsticks:`, params);
        
        setTimeout(() => {
            bot.postMessage(data.channel, `<@${data.user}> i'll see myself out... :man-bowing: :woman-bowing:  :micdrop:`, params);
        }, 3000);
    } catch (error) {
        log.error(`[tell_joke] ${error}`);
    }
};

/**
 * raelbot will get excited if it detects the word 'asda' in a message.
 * @param data - the message received from the user.
 */
const handle_asda_message = data => {
    log.info(`[handle_asda_message] message contains 'asda'...`);
    bot.postMessage(data.channel, `YO DID SOMEONE MENTION ASDA? :raised_hands:`, params);
};

/**
 * raelbot will give an update on its number of matches if it detects the word 'tinder'.
 * @param data - the message received from the user.
 */
const provide_tinder_update = data => {
    log.info(`[provide_tinder_update] message contains 'tinder'...`);
    const matches = Math.floor(Math.random() * 500000);
    bot.postMessage(data.channel, `<@${data.user}> i do love me some tinder! ${matches} matches so far this week! :muscle: :psychoparty:`, params);
};

/**
 * [usage: '@raelbot how long left?']
 * shows the time remaining of the current working day.
 * @param data - the message received from the user.
 */
const show_time_remaining = data => {
    log.info(`[show_time_remaining] received request to show time remaining...`);

    const date = new Date();
    date.setHours(17);
    date.setMinutes(30);
    date.setSeconds(00);

    if (date.getDay() !== 0 && date.getDay() !== 6) {
        if (new Date() < date) {
            var time_remaining = date - new Date();
            var hours = Math.floor((time_remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var minutes = Math.floor((time_remaining % (1000 * 60 * 60)) / (1000 * 60));
            var seconds = Math.floor((time_remaining % (1000 * 60)) / 1000);

            if (hours < 1) {
                bot.postMessage(data.channel, `<@${data.user}> ${minutes} minutes, ${seconds} seconds...`, params);
                setTimeout(() => { 
                    bot.postMessage(data.channel, `<@${data.user}> not long now! :gangstas-paraldise:`, params);
                }, 500);
            } else if (hours < 2) {
                bot.postMessage(data.channel, `<@${data.user}> ${hours} hour, ${minutes} minutes, ${seconds} seconds... :face_with_cowboy_hat:`, params);
            } else {
                bot.postMessage(data.channel, `<@${data.user}> ${hours} hours, ${minutes} minutes, ${seconds} seconds...`, params);
            }

            log.info(`[show_time_remaining] ${hours} hours, ${minutes} minutes, ${seconds} seconds remain.`);
        } else {
            log.info(`[show_time_remaining] the working day is over.`);
            bot.postMessage(data.channel, `<@${data.user}> it's time to go home! enjoy your evening! :slightly_smiling_face:`, params);
        }
    } else {
        log.info(`[show_time_remaining] it's the weekend.`);
        bot.postMessage(data.channel, `<@${data.user}> it's the weekend! have a good one! :psychoparty:`, params);
    }
};

/**
 * [usage: '@raelbot what's your favourite drink?']
 * raelbot is quite the drinker...
 * @param data - the message received from the user.
 */
const handle_favourite_drink = data => {
    log.info(`[handle_favourite_drink] the user is curious about raelbot's favourite drink...`);
    bot.postMessage(data.channel, `<@${data.user}> ${drinks[Math.floor(Math.random() * drinks.length)]}`, params);
};

/**
 * [usage: '@raelbot i love you']
 * @param data - the message received from the user.
 */
const handle_affection = data => {
    log.info(`[handle_affection] received a display of affection...`);
    bot.postMessage(data.channel, `<@${data.user}> i know :slightly_smiling_face:`, params);  
};

/**
 * [usage: '@raelbot owo [text]']
 * 'owoifies' a block of text provided as part of the request.
 * @param data - the message received from the user.
 */
const owo = data => {
    log.info(`[owo] received a owoify request...`);

    const faces = ["(・`ω´・)",";;w;;","owo","UwU",">w<","^w^"];
    
    try {
        let v = data.text.toLowerCase().split('owo ')[1];
        log.info(`[owo] provided text: '${v}'...`);
    
        v = v.replace(/(?:r|l)/g, "w");
        v = v.replace(/(?:R|L)/g, "W");
        v = v.replace(/n([aeiou])/g, 'ny$1');
        v = v.replace(/N([aeiou])/g, 'Ny$1');
        v = v.replace(/N([AEIOU])/g, 'Ny$1');
        v = v.replace(/ove/g, "uv");
    
        
        let exclamationPointCount = 0;
        let stringsearch = "!";
        let i;

        for(let i=0; i < v.length; i++) {
            stringsearch===v[exclamationPointCount++]
        };

        for (i = 0; i < exclamationPointCount; i++) {
            v = v.replace("!", " "+ faces[Math.floor(Math.random()*faces.length)]+ " ");
        }

        log.info(`[owo] converted text: '${v}'...`);

        bot.postMessage(data.channel, `${v}`, params);
    } catch (error) {
        log.error(`[owo] ${error}`);
    }
};

/**
 * [usage: '@raelbot feature request [feature]']
 * adds a feature request to the backlog.
 * @param data - the message received from the user.
 */
const handle_feature_request = data => {
    log.info(`[handle_feature_request] received a feature request...`);

    try {
        let request = data.text.split('feature request')[1].trim();
        let file = JSON.parse(fs.readFileSync('./helpers/requests.json', 'utf8'));
        log.info(`[handle_feature_request] feature request list has been read...`);

        let req_obj = {};
        req_obj['message'] = request;
        req_obj['user'] = data.user;
        file.push(req_obj);

        fs.writeFileSync('./helpers/requests.json', JSON.stringify(file, null, 4));
        log.info(`[handle_feature_request] feature request has been added to the backlog successfully...\n${JSON.stringify(req_obj, null, 4)}`);

        bot.postMessage(data.channel, `<@${data.user}> thanks for the suggestion - it's been added to the backlog :rael-lobster:`, params);
    } catch (error) {
        log.error(`[handle_feature_request] ${error}`);
    }
};

/**
 * [usage: '@raelbot who is your favourite person?']
 * raelbot can be very cute.
 * @param data - the message received from the user.
 */
const handle_cloudia_message = data => {
    log.info(`[handle_cloudia_message] raelbot has only one true love...`);
    bot.postMessage(data.channel, `<@UER3Q7U4E> is my one true love :heart:`, params);
};

/**
 * [usage: '@raelbot who are you?']
 * raelbot will clarify exactly what it is if requested.
 * @param data - the message received from the user. 
 */
const clarify_self = data => {
    log.info(`[clarify_self] the user is curious about raelbot's true identity...`);
    bot.postMessage(data.channel, `<@${data.user}> on all levels except physical, i am Rael Palmer Baker :rael-lobster:`, params);
};

/**
 * [usage: '@raelbot hello']
 * @param data - the message received from the user. 
 */
const issue_greeting = data => {
    log.info(`[issue_greeting] issuing greeting...`);
    bot.postMessage(data.channel, `<@${data.user}> ${greetings[Math.floor(Math.random() * greetings.length)]}`, params);
};

/**
 * [usage: '@raelbot random chonker']
 * gets a random big chungus from r/chonkers.
 * @param data - the message received from the user. 
 */
const share_random_chonker = async data => {
    log.info(`[share_random_chonker] user has requested a chungus...`);

    try {
        let response = await axios.get(endpoints.chonkers);
        let chonkers = response.data.data.children;

        chonkers = chonkers.filter(chonk => chonk.data.ups > 25);
        chonkers = chonkers.filter(chonk => chonk.data.url.match(/.jpg|.png/));
        chonkers = chonkers.filter(chonk => chonk.data.over_18 === false);
        
        let chonker = chonkers[Math.floor(Math.random() * chonkers.length)].data;
        
        params = {
            "blocks": [
                {
                    "type": "image",
                    "title": {
                        "type": "plain_text",
                        "text": chonker.title,
                        "emoji": true
                    },
                    "image_url": chonker.url,
                    "alt_text": "raelbot"
                }
            ]
        }

        log.info(`[share_random_chonker] sharing '${chonker.title}' (${chonker.url})...`);

        bot.postMessage(data.channel, '', params);
        params = {};
    } catch (error) {
        log.error(`[share_random_chonker] ${error}`);
    }
};

/**
 * TODO.
 */
const show_random_image = (data, lobster) => {
    if (lobster) {
        params = {
            "blocks": [
                {
                    "type": "image",
                    "title": {
                        "type": "plain_text",
                        "text": "raelbotlovesaheinekentbqh",
                        "emoji": true
                    },
                    "image_url": "https://yt3.ggpht.com/a/AGF-l78XioENTEiORE45NmE7_bClF5-IetCttyKzNg=s900-c-k-c0xffffffff-no-rj-mo",
                    "alt_text": "raelbot"
                }
            ]
        }
        bot.postMessage(data.channel, '', params);
        params = {};
        return;
    }
};

/**
 * [usage: '@raelbot what pub should we go to?']
 * uses the foursquare api to suggest a random nearby pub to visit.
 * also provides the address and a google maps link.
 * @param data - the message received from the user. 
 */
const suggest_random_pub = async data => {
    log.info(`[suggest_random_pub] received a request to suggest a random pub...`);

    const date = new Date().toISOString().split('T')[0].replace(/-/g,'');

    try {
        let response = await axios.get(`${endpoints.foursquare_search}?client_id=${foursquare_credentials.id}&client_secret=${foursquare_credentials.secret}&ll=51.478388,-3.178090&radius=300&categoryId=${foursquare_pubs_id}&limit=20&v=${date}`);
        let locations = response.data.response.venues;
        let venue = locations[Math.floor(Math.random() * locations.length)];

        log.info(`[suggest_random_pub] raelbot suggests '${venue.name}' at ${venue.location.formattedAddress.toString()}...`);

        bot.postMessage(data.channel, `<@${data.user}> :rael-heineken: :speech_balloon: "you guys should go to *${venue.name}*..." :beers:`, params);
        
        setTimeout(() => {
            bot.postMessage(data.channel, `>>> ${venue.location.formattedAddress.toString().replace(/,/g,'\n')}\nhttps://www.google.com/maps/place/${venue.location.formattedAddress.toString().replace(/ /g,'+')}`, params);
        },3000);
    } catch (error) {
        log.error(`[suggest_random_pub] ${error}`);
    }
};

/**
 * [usage: '@raelbot who is out?']
 * get a list of people out of office on annual leave (or working from home) for the current day.
 * @param data - the message received from the user.
 */
const handle_bamboo_ooo = async data => {
    let date = new Date();
    date = date.toISOString().split('T')[0];
    
    try {
        let bamboo = await axios.get(`${endpoints.bamboohr}?start=${date}&end=${date}`, 
        {
            headers: {
                Authorization: `Basic ${Base64.encode(bamboo_credentials.token)}`,
                Accept: 'application/json'
            }
        });
    
        let ooo_list = [];
        let employee_list = bamboo.data;
        for (const e of employee_list) {
            if (e.type === 'holiday') {
                continue;
            }
            for (const m of jackdaw) {
                if (m.bamboo_name === e.name) {
                    if (!ooo_list.includes(m.formatted_name)){
                        ooo_list.push({value: `> ${m.formatted_name}`});
                        break;
                    }
                }
            }
        }

        params = {
            "attachments": [
                {
                    "fallback": "raelbot",
                    "color": "#882100",
                    "title_icon": "https://files.slack.com/files-pri/T1K84R8AW-FP1D1QYEP/raelbot.jpg",
                    "title": `there are ${ooo_list.length} people out of office today...`,
                    "fields": ooo_list,
                    "footer": `(includes WFH and annual leave for ${date})`
                }
            ]
        }
        bot.postMessage(data.channel, '', params); 
        params = {}; 
    } catch (error) {
        log.error(`[handle_bamboo_ooo] ${error}`);
    }
};

/**
 * [usage: '@raelbot trello update']
 * gets a list of any trello cards in 'todo', 'doing' and 'fixes'.
 * @param data - the message received from the user. 
 */
const handle_trello_update = async data => {
    const trello_lists = [{id: trello_credentials.todo_list, list: 'To Do'}, {id: trello_credentials.qa_list, list: 'Doing'}, {id: trello_credentials.fixes_list, list: 'Fixes'}];

    bot.postMessage(data.channel, `<@${data.user}> here's a QA update...`, params);

    try {
        setTimeout(async () => {
            for (let i=0;i<trello_lists.length;i++) {
                await setTimeout(() => {}, 5000);
                let response = await axios.get(`${endpoints.trello}${trello_lists[i].id}/cards?key=${trello_credentials.key}&token=${trello_credentials.token}`);
                let cards = [];
                for (const c of response.data) {
                    cards.push({value: `> <${c.url}|${c.name}>\n>*last modified:* ${new Date(c.dateLastActivity).toGMTString()}`});
                }
        
                params = {
                    "attachments": [
                        {
                            "fallback": "raelbot",
                            "color": "#882100",
                            "title": `${cards.length} cards in '${trello_lists[i].list}'...`,
                            "fields": cards
                        }
                    ]
                };
    
                bot.postMessage(data.channel, '', params);
                params = {};
            }
        }, 3000);
    } catch (error) {
        log.error(`[handle_trello_update] ${error}`);
    }
};

// TODO: refactor
// cron.schedule("10 09 * * 1-5", async () => {
//     const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
//     await axios.post(endpoints.paypal_cardiff, 
//     {
//         "text": `<!here> happy ${days[new Date().getDay()]}! here's a morning update... :rael-lobster:`
//     });
//     setTimeout(async () => { await provide_zendesk_update(); }, 10000);
//     setTimeout(async () => { await provide_zendesk_update(); }, 20000);
//     setTimeout(async () => { await handle_bamboo_ooo(); }, 30000);
// },
// {
//     scheduled: true,
//     timezone: "Europe/London"
// });

/**
 * listens for requests and uses the passed query parameters to authenticate a spotify user.
 */
app.post('/auth/login', async (req, res) => {
    log.info(`[spotify] [/auth/login] request received...`);
    handle_spotify_login(req.query);
});

/**
 * on request the current spotify user is logged out.
 */
app.post('/auth/logout', async (req, res) => {
    log.info(`[spotify] [/auth/logout] request received...`);
    handle_spotify_logout();
});

/**
 * returns the status of any currently authenticated spotify users.
 */
app.get('/status', async (req, res) => {
    log.info(`[spotify] [/status] request received...`);

    if (spotify_credentials.access_token === null) {
        res.status(200).json({
            status: 'INACTIVE',
            message: 'not logged in'
        });
    }
    res.status(200).json({
        status: 'ACTIVE',
        message: 'logged in',
        user:  spotify_credentials.user
    });
});

app.listen(3000, () => {
    log.info('[init] raelbot is listening on port 3000...');
});