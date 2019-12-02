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

const endpoints = require('./helpers/api_endpoints');
const jackdaw = require('./helpers/jackdaw');
const loubot_quotes = require('./helpers/loubot_quotes');
const taylor_songs = require('./helpers/taylor_songs');
const rael_messages = require('./helpers/rael_messages');

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
const pubs_pattern = /where should we go/;
const affection_pattern = /love you/;
const tag_pattern = /check for tag/;

const whitelisted_channels = /GDYFAL0HJ|CD2FKB621|GB7LT0TKK|DP07UQJD8|DPFFK0287|DQ2SNH0L9|GQ9QLM4NN|GQRJ5NPDH/;
const whitelisted_users = /U9C81JU91/;

const spotify_pattern = /play|dj|what song is this|next song|previous song|spotify status|shuffle|change volume to|christmas party playlist/;
const spotify_channels = /GB7LT0TKK|CD2FKB621|DP07UQJD8|GQ9QLM4NN|GQRJ5NPDH/;
const christmas_playlist_id_old = '0vXdwTD04TCEivqsMnj0oM';
const christmas_playlist_id = '1KfvD9bvlMA1xlH5zrF28B';
const rael_playlist_id = '0BOcBAiGEypv5rcKggfP0J';

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

            // if raelbot is waiting from a response, it will be prioritised above anything else.
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
            else if (message_text.match(/quote/) && message_text.match(requested_quote_pattern)) handle_requested_quote(data);
            else if (message_text.match(fact_pattern)) handle_random_fact(data);
            else if (message_text.match((help_pattern))) help(data);
            else if (message_text.match(tag_pattern)) conduct_tag_check(data);
            else if (message_text.match(pubs_pattern)) handle_random_pub(data);
            else if (message_text.match(team_pattern)) handle_favourite_team(data);
            else if (message_text.match(dance_pattern)) dance(data);
            else if (message_text.match(rael_just_said_pattern)) handle_quote_add(data);
            else if (message_text.match(zendesk_pattern)) handle_zendesk_message(data);
            else if (message_text.match(joke_pattern)) handle_joke(data);
            else if (message_text.match(asda_pattern)) handle_asda_message(data);
            else if (message_text.match(tinder_pattern)) provide_tinder_update(data);
            else if (message_text.match(time_remaining_pattern)) handle_time_remaining(data);
            else if (message_text.match(drink_pattern)) handle_favourite_drink(data);
            else if (message_text.match(affection_pattern)) handle_affection(data);
            else if (message_text.match(image_pattern)) show_random_image(data);
            else if (message_text.match(lobster_pattern)) show_random_image(data, true); 
            else if (message_text.match(owo_pattern)) owo(data);
            else if (message_text.match(cloudia_pattern)) handle_cloudia_message(data);
            else if (message_text.match(feature_pattern)) handle_feature_request(data);
            else if (message_text.match(clarify_pattern)) clarify_self(data); 
            else if (message_text.match(greetings_pattern)) handle_greeting(data);
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
            message: 'not logged in...'
        });
    }
    res.status(200).json({
        status: 'ACTIVE',
        message: 'logged in...',
        user:  spotify_credentials.user
    });
});

app.listen(3000, () => {
    log.info('[init] raelbot is listening on port 3000...');
});