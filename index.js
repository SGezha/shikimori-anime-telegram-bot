const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
require('dotenv').config()
const fs = require('fs')

const express = require('express')
const app = express()
const port = 7276

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port http://localhost:${port}`)
})

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.command('oldschool', (ctx) => ctx.reply('Hello'))
bot.command('hipster', Telegraf.reply('λ'))
bot.launch()

bot.command('findbyid', async (ctx) => {
  let msgText = ctx.message.text;
  if(msgText.split(' ')[1] == undefined) return ctx.reply('Неверный формат команды. \nПример команды: /findbyid <id>')
  const res = await axios.get(`https://shikimori.one/api/animes/${msgText.split(' ')[1]}`)
  const anime = res.data
  ctx.reply(`<a href="https://shikimori.one/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
Жанры: ${anime.genres.map(genre => genre.russian).join(', ')}
Рейтинг: ${anime.rating.toUpperCase()}
ID: ${anime.id}
Тип: ${anime.kind.toUpperCase()}<a href="${`https://shikimori.one${anime.image.original}`}">\n</a>${anime.description.replace(/([\[]*)\[(.*?)\]/gm, '')}
`, { parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: 'Список серий', callback_data: 'list_dub-1', hide: false }]] }) })
})

// bot.telegram.editMessageText(msg.chat.id, msg.message_id, msg.message_id, 'text')

bot.on('text', (ctx) => {
  // Explicit usage
  console.log(ctx.message)
  // ctx.tg.deleteMessage(ctx.chat.id, ctx.message.message_id)

  // Using context shortcut
})

bot.on('inline_query', async (ctx) => {
  try {
    let query = ctx.update.inline_query.query
    let search = `https://shikimori.one/api/animes/?limit=50&search=${encodeURI(query)}`

    let result = []

    let res = await axios.get(search)
    const data = res.data

    data.forEach(async (i, ind) => {
      result.push({
        type: 'article',
        id: (new Date()).getTime().toString(36) + (Math.random() * ind).toString(36).slice(2),
        animeId: i.id,
        title: `${i.name}`,
        description: `${i.russian ? i.russian : ''}`,
        thumb_url: `https://shikimori.one${i.image.x48}`,
        input_message_content: {
          message_text: `/findbyid ${i.id}`
        },
      })
    })


    return ctx.answerInlineQuery(result)
  } catch (er) {
    console.log(er)
  }
})

bot.action(/^select-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let epidose = ctx.match[1]
  console.log(epidose)
})

bot.action('about', async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  const res = await axios.get(`https://shikimori.one/api/animes/${animeId}`)
  const anime = res.data
  bot.telegram.editMessageText(msg.from.id, msg.message.message_id, msg.message.message_id, `<a href="https://shikimori.one/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
Жанры: ${anime.genres.map(genre => genre.russian).join(', ')}
Рейтинг: ${anime.rating.toUpperCase()}
ID: ${anime.id}
Тип: ${anime.kind.toUpperCase()}<a href="${`https://shikimori.one${anime.image.original}`}">\n</a>${anime.description.replace(/([\[]*)\[(.*?)\]/gm, '')}
`, { parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: 'Список серий', callback_data: 'list_dub-1', hide: false }]] }) })
  ctx.answerCbQuery(``)
})

bot.action(/^list_dub-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
  let episode = +ctx.match[0].split('-')[1]
  const res = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' }  })
  let episodeText = getEpisode(res.data, 0);
  let animeKeyboard = {'inline_keyboard': [
    [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '✅ Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: 'Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: 'Оригинал', callback_data: `list_original-${episode}`, hide: false }],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
  ]}
  let episodesNow = episode
  if(episode != 1) episodesNow -= 4
  if(episodesNow <= 0) episodesNow = 1
  for(let i = 1; i < 4; i++) {
    for(let j = 0; j < 4; j++ ) {
      animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ '  : ''}${episodesNow} серия`
      animeKeyboard.inline_keyboard[i][j].callback_data = `list_dub-${episodesNow}`
      animeKeyboard.inline_keyboard[i][j].hide = `false`
      episodesNow++
    }
  }
  animeKeyboard.inline_keyboard[1]
  bot.telegram.editMessageText(msg.from.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
  ctx.answerCbQuery(``)
})

bot.action(/^list_sub-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
  let episode = +ctx.match[0].split('-')[1]
  const res = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' }  })
  let episodeText = getEpisode(res.data, 1);
  let animeKeyboard = {'inline_keyboard': [
    [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: '✅ Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: 'Оригинал', callback_data: `list_original-${episode}`, hide: false }],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
  ]}
  let episodesNow = episode
  if(episode != 1) episodesNow -= 4
  if(episodesNow <= 0) episodesNow = 1
  for(let i = 1; i < 4; i++) {
    for(let j = 0; j < 4; j++ ) {
      animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ '  : ''}${episodesNow} серия`
      animeKeyboard.inline_keyboard[i][j].callback_data = `list_sub-${episodesNow}`
      animeKeyboard.inline_keyboard[i][j].hide = `false`
      episodesNow++
    }
  }
  animeKeyboard.inline_keyboard[1]
  bot.telegram.editMessageText(msg.from.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
  ctx.answerCbQuery(``)
})

bot.action(/^list_original-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
  let episode = +ctx.match[0].split('-')[1]
  const res = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' }  })
  let episodeText = getEpisode(res.data, 2);
  let animeKeyboard = {'inline_keyboard': [
    [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: 'Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: '✅ Оригинал', callback_data: `list_original-${episode}`, hide: false }],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
    [{}, {}, {}, {}],
  ]}
  let episodesNow = episode
  if(episode != 1) episodesNow -= 4
  if(episodesNow <= 0) episodesNow = 1
  for(let i = 1; i < 4; i++) {
    for(let j = 0; j < 4; j++ ) {
      animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ '  : ''}${episodesNow} серия`
      animeKeyboard.inline_keyboard[i][j].callback_data = `list_original-${episodesNow}`
      animeKeyboard.inline_keyboard[i][j].hide = `false`
      episodesNow++
    }
  }
  animeKeyboard.inline_keyboard[1]
  bot.telegram.editMessageText(msg.from.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
  ctx.answerCbQuery(``)
})

function getEpisode(data, type) {
  let episodesArray = [{
      name: 'dub',
      data: []
    }, {
      name: 'sub',
      data: []
    }, {
      name: 'orginal',
      data: []
    }
  ]
  data.forEach(a => {
    if(a.kind == 'озвучка') episodesArray[0].data.push(a)
    if(a.kind == 'субтитры') episodesArray[1].data.push(a)
    if(a.kind == 'оригинал') episodesArray[2].data.push(a)
  })
  let episodeText = '';
  episodesArray[type].data.sort((a, b) => b.watches_count - a.watches_count).forEach((a, ind) => {
    if(ind == 0) episodeText += `\n`
    let type = a.url
    if(a.url.includes('https')) { type = `${type.split('https://')[1].split('/')[0]}` }
    else { type = `${type.split('http://')[1].split('/')[0]}` }
        
    episodeText += `${a.author} ${a.quality != 'unknown' ? a.quality : ''} - <a href="${a.url}">${type}</a> ${a.watches_count ? '[📺 ' + a.watches_count + ']' : ''}`
    if(ind != episodesArray[0].data.length - 1) episodeText += '\n'
  })
  return episodeText
}

bot.on('chosen_inline_result', ({ chosenInlineResult }) => {
  console.log('chosen inline result', chosenInlineResult)
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
