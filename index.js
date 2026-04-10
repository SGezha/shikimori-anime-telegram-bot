const { Telegraf, Markup } = require('telegraf'),
  { getGenre, statusToRus, getEpisode, msToTime, toHHMMSS, getRandomInt, isWhatPercentOf, getShikiImage, getRandomSettings } = require('./functions')
axios = require('axios'),
  fs = require('fs-extra'),
  express = require('express'),
  app = express(),
  port = 7276,
  qs = require('querystring'),
  passport = require('passport'),
  { Strategy } = require('passport-shikimori'),
  StormDB = require("stormdb"),
  engine = new StormDB.localFileEngine("./db.stormdb"),
  ffmpeg = require('fluent-ffmpeg'),
  path = require('path'),
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path,
  ffprobePath = require('@ffprobe-installer/ffprobe').path,
  puppeteer = require('puppeteer'),
  archiver = require('archiver'),
  HttpsProxyAgent = require("https-proxy-agent"),
  nodeHtmlToImage = require('node-html-to-image')

const db = new StormDB(engine)
db.default({ profiles: [] })

const httpsAgent = new HttpsProxyAgent({ host: "localhost", port: "8118" })

let axios_proxy = axios.create({ httpsAgent })
// let axios_proxy = axios

let lastTGid = 0

ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

require('dotenv').config()

async function getNewToken(user) {
  try {
    let { data: newUser } = await axios.post(`https://shikimori.io/oauth/token`, { grant_type: 'refresh_token', client_id: process.env.SHIKI_CLIENT_ID, client_secret: process.env.SHIKI_CLIENT_SECRET, refresh_token: user.refreshToken }, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    let nowUser = db.get('profiles').value().find(a => { if (user.telegram_id == a.telegram_id) return true })
    nowUser.token = newUser.access_token
    nowUser.refreshToken = newUser.refresh_token
    db.get('profiles').save()
    return nowUser
  } catch (er) {
    bot.telegram.sendMessage(user.telegram_id, `Ошибка при обновлении токена: ${er}\n Можете попробовать удалить профиль командой /deleteacc и заново авторизоваться /auth.`)
  }
}

const getAnimeData = async (user, anime, animeId, random, message) => {
  let nowEpisode = 1
  let animeKeyboard = { 'inline_keyboard': [[{ text: '📺 Список серий', callback_data: `list_dub-${nowEpisode}`, hide: false }]] }
  if (user != undefined && !random) {
    user = await getNewToken(user)
    const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${anime.id}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
    if (list.length > 0) {
      nowEpisode = list[0].episodes
      animeKeyboard.inline_keyboard[0][0].callback_data = `list_dub-${nowEpisode}`
      animeKeyboard.inline_keyboard[0].push({ text: `⭐ Изменить оценку (${list[0].score})`, callback_data: `star-20`, hide: false })
      animeKeyboard.inline_keyboard.push([{ text: `🔹 Изменить статус (${statusToRus(list[0].status)})`, callback_data: `status-20`, hide: false }])
    } else {
      animeKeyboard.inline_keyboard[0].push({ text: `⭐ Поставить оценку`, callback_data: `star-20`, hide: false })
      animeKeyboard.inline_keyboard.push([{ text: `🔹 Поставить статус`, callback_data: `status-20`, hide: false }])
    }
  }
  if (random) {
    animeKeyboard.inline_keyboard.push([
      { text: `Выбрать тип`, callback_data: `random_kind-20`, hide: false },
      { text: `Выбрать статус`, callback_data: `random_status-20`, hide: false },
    ])
    animeKeyboard.inline_keyboard.push([
      { text: `Выбрать мин. оценку`, callback_data: `random_min_star-20`, hide: false },
      { text: `Выбрать жанры`, callback_data: `random_genres-100`, hide: false },
    ])
    if (message) {
      let randomSettings = getRandomSettings(message)
      if (randomSettings.star) animeKeyboard.inline_keyboard[2][0].text = `Изменить (${randomSettings.star} ⭐)`
      if (randomSettings.kind) {
        randomSettings.kind = randomSettings.kind.toUpperCase()
        if (randomSettings.kind == 'MOVIE') randomSettings.kind = 'Фильм'
        if (randomSettings.kind == 'MUSIC') randomSettings.kind = 'Музыка'
        if (randomSettings.kind == 'SPECIAL') randomSettings.kind = 'Спешл'
        animeKeyboard.inline_keyboard[1][0].text = `Изменить (${randomSettings.kind})`
      }
      if (randomSettings.status) {
        if (randomSettings.status == 'anons') randomSettings.status = 'Анонсировано'
        if (randomSettings.status == 'ongoing') randomSettings.status = 'Сейчас выходит'
        if (randomSettings.status == 'released') randomSettings.status = 'Вышедшее'
        animeKeyboard.inline_keyboard[1][1].text = `Изменить (${randomSettings.status})`
      }
      if (randomSettings.genres.length > 0) {
        animeKeyboard.inline_keyboard[2][1].text = `Изменить (${randomSettings.genres.map((genresId) => getGenre(genresId)).toString()})`
      }
    }
    animeKeyboard.inline_keyboard[0][0].text = `✅ Выбрать аниме`
    animeKeyboard.inline_keyboard[0][0].callback_data = `about`
    animeKeyboard.inline_keyboard.push([{ text: `🔄 Рерол`, callback_data: `random`, hide: false }])
  }
  return {
    msg: `<a href="https://shikimori.io/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
Жанры: ${anime.genres?.map(genre => genre.russian).join(', ')}
Рейтинг: ${anime.rating?.toUpperCase()}
ID: ${anime.id}
Тип: ${anime.kind.toUpperCase()}<a href="${`https://shikimori.io${anime.image.original}`}">\n</a>${anime.description ? (anime.description.replace(/([\[]*)\[(.*?)\]/gm, '').length > 299) ? anime.description.replace(/([\[]*)\[(.*?)\]/gm, '').slice(0, 300) + '...' : anime.description.replace(/([\[]*)\[(.*?)\]/gm, '') : ''}${user != undefined ? '\nСейчас тыкает: <b>' + user.nickname + '</b>' : ''}`,
    keyboard: animeKeyboard
  }
}


passport.use(new Strategy(
  {
    clientID: process.env.SHIKI_CLIENT_ID,
    clientSecret: process.env.SHIKI_CLIENT_SECRET,
    callbackURL: 'https://shiki.sgezha.ru/auth/shikimori/callback',
    scope: ['user_rates'],
    authorizationURL: 'https://shikimori.io/oauth/authorize',
    tokenURL: 'https://shikimori.io/oauth/token'
  },
  (accessToken, refreshToken, profile, done) => {
    let obj = {
      telegram_id: lastTGid,
      shikimori_id: profile.id,
      nickname: profile.nickname,
      token: accessToken,
      refreshToken: refreshToken
    }
    if (db.get('profiles').value().find(a => { if (a.telegram_id == obj.telegram_id) return true }) == undefined) {
      db.get('profiles').push(obj).save()
      bot.telegram.sendMessage(lastTGid, `Вы авторизовались в Shikimori под ником ${profile.nickname}. Теперь можете пользоваться ботом :3`)
    }
    done(null)
  }
))

app.use(express.static('anime'))

app.get('/restart', (req, res) => {
  res.send(`Перезагрузка бота...`)
  process.exit(1)
})

app.get('/kodik', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader("Access-Control-Allow-Methods", "*")
  res.setHeader('Access-Control-Allow-Headers', 'origin, content-type, accept')
  const req_data = qs.parse(req.url.split('?')[1])
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${req_data.title}</title><style>* {margin: 0;padding: 0; }body {height: 100vh;} iframe {width: 100%;height: 100%;}</style></head><body><iframe src="${req_data.video}" name="anime" frameborder="0" AllowFullScreen allow="autoplay *; fullscreen *"></iframe></body></html>`)
})

app.get('/authorize', (req, res) => {
  const req_data = qs.parse(req.url.split('?')[1])
  lastTGid = req_data.id
  res.redirect('/auth/shikimori')
})

app.get('/auth/shikimori', passport.authenticate('shikimori'))

app.get('/auth/shikimori/callback',
  passport.authenticate('shikimori', {
    failureRedirect: '/'
  }),
  (req, res) => {
    res.redirect('/result') // Successful auth
  }
)

app.get('/', (req, res) => {
  res.send('Бот для просмотра аниме в телеграмме. С функцией синхронизации прогресса с шикимори. @FuNSasha')
})

app.listen(port, () => {
  console.log(`Example app listening on port http://localhost:${port}`)
})

const { SocksProxyAgent } = require('socks-proxy-agent')

const proxyUri = 'socks5://proxyuser:13792846@194.156.66.233:1080'
const agent = new SocksProxyAgent(proxyUri)

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    agent: agent
  }
})

bot.launch()
  .then(res => {
    console.log('Bot started')
  })

bot.start(async (ctx) => {
  let msgText = ctx.message.text
  if (ctx.from.id != ctx.chat.id) return
  ctx.reply(`Привет, это бот для просмотра аниме с возможностью синхранизации данных с шикимори.\nБот использует базу данных <a href="https://shikimori.io">shikimori.io</a> и базу видео <a href="https://chrome.google.com/webstore/detail/shikicinema/hmbjohbggdnlpmokjbholpgegcdbehjp?hl=ru">Shikicinema</a>\n\nДля поиска пишите: 
@shikimori_anime_bot [Тут название аниме]
\nДля синхранизации данных в шикимори нажмите кнопки внизу.`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: '⚙️ Пройти авторизацию на шикимори', url: `https://shiki.sgezha.ru/authorize?id=${ctx.from.id}`, hide: false }]] }) })
})

bot.command('help', async (ctx) => {
  let msgText = ctx.message.text
  ctx.reply(`Бот для бесплатного просмотра аниме в телеграмме. С функцией синхронизации прогресса с шикимори.
Гайд по использованию бота: https://telegra.ph/Kak-polzovatsya-botom-10-08-2

Для поиска пишите: 
@shikimori_anime_bot [Тут название аниме]

Создатель бота: @FuNSasha`)
})

bot.command('deleteacc', async (ctx) => {
  let msgText = ctx.message.text
  let text = 'Список анимешников: '
  let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
  if (user != undefined) {
    db.get("profiles").set(db.get('profiles').value().filter(a => a.telegram_id != ctx.from.id)).save()
    ctx.reply(`Вы удалили свой аккаунт.\nЧтобы заново авторизоватся введите команду /auth (только в личных сообщениях с ботом).`, { disable_notification: true, disable_web_page_preview: true, parse_mode: 'HTML' })
  }
})

bot.command('list', async (ctx) => {
  let msgText = ctx.message.text
  let text = 'Список анимешников: '
  let list = db.get('profiles').value()
  list.slice(0, 50).forEach(u => {
    text += `\n<a href="https://shikimori.io/${u.nickname}">${u.nickname}</a> - <a href="${u.telegram_id}">${u.telegram_id}</a>`
  })
  ctx.reply(text, { disable_notification: true, disable_web_page_preview: true, parse_mode: 'HTML' })
})

bot.command('auth', async (ctx) => {
  let msgText = ctx.message.text
  if (ctx.from.id != ctx.chat.id) return
  ctx.reply(`Для авторизации в шикимори нажмите кнопки внизу.`, { parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: '⚙️ Пройти авторизацию на шикимори', url: `https://shiki.sgezha.ru/authorize?id=${ctx.from.id}`, hide: false }]] }) })
})

bot.command('random', async (ctx) => {
  try {
    let msgText = ctx.message.text
    axios.get(`https://shikimori.io/api/animes?limit=50&score=2&order=random`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`)
      const anime = res.data
      let animeData = await getAnimeData(user, anime, msgText.split(' ')[1], true)
      ctx.reply(animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
      ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
    })
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.command('findbyid', async (ctx) => {
  try {
    let msgText = ctx.message.text
    if (msgText.split(' ')[1] == undefined) return ctx.reply('Неверный формат команды. \nПример команды: /findbyid <id>')
    let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
    const res = await axios.get(`https://shikimori.io/api/animes/${parseInt(msgText.split(' ')[1])}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    const anime = res.data
    let animeData = await getAnimeData(user, anime, msgText.split(' ')[1])
    bot.telegram.sendMessage(ctx.chat.id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.command('charactersbyid', async (ctx) => {
  try {
    let msgText = ctx.message.text
    if (msgText.split(' ')[1] == undefined) return ctx.reply('Неверный формат команды. \nПример команды: /charactersbyid <id>')
    const res = await axios.get(`https://shikimori.io/api/characters/${parseInt(msgText.split(' ')[1])}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    const character = res.data
    ctx.reply(`<a href="https://shikimori.io${character.url}"><b>${character.name}</b> ${character.russian ? '(' + character.russian + ')' : ''}</a><a href="https://shikimori.io${character.image.original}">\n</a>${character.description ? (character.description.replace(/([\[]*)\[(.*?)\]/gm, '').length > 299) ? character.description.replace(/([\[]*)\[(.*?)\]/gm, '').slice(0, 300) + '...' : character.description.replace(/([\[]*)\[(.*?)\]/gm, '') : ''}

<b>СЭЙЮ:</b> ${character.seyu.map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).join(', ')}
<b>Аниме:</b> ${character.animes.slice(0, 5).map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).join(', ')}
<b>Манга:</b> ${character.mangas.slice(0, 5).map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).slice(0, 30).join(', ')}
`, { parse_mode: 'HTML', disable_web_page_preview: false })
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных персонажа. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.command('profile', async (ctx) => {
  try {
    let msgText = ctx.message.text
    let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
    if (user != undefined) {
      user = await getNewToken(user)
      const { data: profile } = await axios.get(`https://shikimori.io/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${profile.id}&limit=1000&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      const { data: animeList } = await axios.get(`https://shikimori.io/api/animes?ids=${[...list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true })].map(id => id.target_id).join(',')}&limit=50`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      let animes = {
        planned: [...list.filter(a => { if (a.status == 'planned') return true })],
        watching: [...list.filter(a => { if (a.status == 'watching') return true })],
        completed: [...list.filter(a => { if (a.status == 'completed') return true })],
        rewatching: [...list.filter(a => { if (a.status == 'rewatching') return true })],
        on_hold: [...list.filter(a => { if (a.status == 'on_hold') return true })],
        dropped: [...list.filter(a => { if (a.status == 'dropped') return true })]
      }
      let nowText = `
Запланировано: ${animes.planned.length} | Смотрю: ${animes.watching.length} | Пересматриваю: ${animes.rewatching.length} | Просмотрено: ${animes.completed.length} | Отложено: ${animes.on_hold.length} | Брошено: ${animes.dropped.length}

<b>Сейчас смотрит (${[...list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true })].length}):</b> `
      list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true }).forEach(async (a, ind) => {
        let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
        if (animeData) nowText += `\n<a href="https://shikimori.io/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
      })
      let animeKeyboard = {
        'inline_keyboard': [
          [{ text: '✅ Профиль', callback_data: `profile-${ctx.from.id}`, hide: false }, { text: 'Список аниме', callback_data: `profile_completed-${ctx.from.id}`, hide: false }],
        ]
      }

      ctx.reply(`<a href="${profile.url}"><b>${profile.nickname}</b></a><a href="${profile.image.x160}">\n</a>Последняя активность: ${new Date(profile.last_online_at).toLocaleDateString()}\nВозраст: ${profile.full_years}\n${nowText}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard), disable_web_page_preview: true })
    } else {
      ctx.reply(`Для авторизации введите команду /auth (Работает только в личных сообщениях).`)
    }
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.action('random', async (ctx) => {
  try {
    let msg = ctx.update.callback_query
    let randomSettings = getRandomSettings(msg.message.text)
    axios.get(`https://shikimori.io/api/animes?limit=50&order=random${randomSettings.query}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      const anime = res.data
      let animeData = await getAnimeData(user, anime, randomRes.data[0].id, true, msg.message.text)
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${animeData.msg}${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    })
    ctx.answerCbQuery(``)
  } catch (er) {
    console.log(er)
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.action(/^profile-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selectedUser = ctx.match[1]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    user = await getNewToken(user)
    const { data: profile } = await axios.get(`https://shikimori.io/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
    const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${profile.id}&limit=1000&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
    const { data: animeList } = await axios.get(`https://shikimori.io/api/animes?ids=${[...list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true })].map(id => id.target_id).join(',')}&limit=50`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    let animes = {
      planned: [...list.filter(a => { if (a.status == 'planned') return true })],
      watching: [...list.filter(a => { if (a.status == 'watching') return true })],
      completed: [...list.filter(a => { if (a.status == 'completed') return true })],
      rewatching: [...list.filter(a => { if (a.status == 'rewatching') return true })],
      on_hold: [...list.filter(a => { if (a.status == 'on_hold') return true })],
      dropped: [...list.filter(a => { if (a.status == 'dropped') return true })]
    }
    let nowText = `
Запланировано: ${animes.planned.length} | Смотрю: ${animes.watching.length} | Пересматриваю: ${animes.rewatching.length} | Просмотрено: ${animes.completed.length} | Отложено: ${animes.on_hold.length} | Брошено: ${animes.dropped.length}

<b>Сейчас смотрит (${[...list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true })].length}):</b> `
    list.filter(a => { if (a.status == 'watching' || a.status == 'rewatching') return true }).forEach(async (a, ind) => {
      let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
      if (animeData) nowText += `\n<a href="https://shikimori.io/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
    })
    let animeKeyboard = {
      'inline_keyboard': [
        [{ text: '✅ Профиль', callback_data: `profile-${selectedUser}`, hide: false }, { text: 'Список аниме', callback_data: `profile_completed-${selectedUser}`, hide: false }],
      ]
    }
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<a href="${profile.url}"><b>${profile.nickname}</b></a><a href="${profile.image.x160}">\n</a>Последняя активность: ${new Date(profile.last_online_at).toLocaleDateString()}\nВозраст: ${profile.full_years}\n${nowText}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard), disable_web_page_preview: true })
  } else {
    ctx.reply(`Для авторизации введите команду /auth (Работает только в личных сообщениях)`)
  }
  ctx.answerCbQuery(``)
})

bot.action(/^profile_completed-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selectedUser = ctx.match[1]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    user = await getNewToken(user)
    const { data: profile } = await axios.get(`https://shikimori.io/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
    let { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${profile.id}&limit=1000&status=completed`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
    list = list.sort((a, b) => b.score - a.score).slice(0, 50)
    const { data: animeList } = await axios.get(`https://shikimori.io/api/animes?ids=${list.map(id => id.target_id).join(',')}&limit=50`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    let nowText = `<b>Список просмотренного:</b> `
    list.sort((a, b) => b.score - a.score).slice(0, 50).forEach(async (a, ind) => {
      let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
      if (animeData) nowText += `\n<a href="https://shikimori.io/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
    })
    let animeKeyboard = {
      'inline_keyboard': [
        [{ text: 'Профиль', callback_data: `profile-${selectedUser}`, hide: false }, { text: '✅ Список аниме', callback_data: `profile_completed-${selectedUser}`, hide: false }],
      ]
    }
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<a href="${profile.url}"><b>${profile.nickname}</b></a>\n${nowText}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard), disable_web_page_preview: true })
  } else {
    ctx.reply(`Для авторизации введите команду /auth (Работает только в личных сообщениях)`)
  }
  ctx.answerCbQuery(``)
})

bot.action('about', async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
  const res = await axios.get(`https://shikimori.io/api/animes/${animeId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
  const anime = res.data
  let animeData = await getAnimeData(user, anime, animeId)
  bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
  ctx.answerCbQuery(``)
})

bot.action(/^status-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let statusKeyboard = {
    'inline_keyboard': [
      [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Просмотрено', callback_data: `status-0`, hide: false }, { text: 'Смотрю', callback_data: `status-1`, hide: false }],
      [{ text: 'Пересматриваю', callback_data: `status-2`, hide: false }, { text: 'Запланировано', callback_data: `status-3`, hide: false }, { text: 'Отложено', callback_data: `status-4`, hide: false }],
      [{ text: 'Брошено', callback_data: `status-5`, hide: false }, { text: '🗑 Удалить из списка', callback_data: `status-6`, hide: false }]
    ]
  }
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    user = await getNewToken(user)
    if (selected != 20 && selected != 6) {
      let status = ''
      if (selected == 0) status = 'completed'
      if (selected == 1) status = 'watching'
      if (selected == 2) status = 'rewatching'
      if (selected == 3) status = 'planned'
      if (selected == 4) status = 'on_hold'
      if (selected == 5) status = 'dropped'
      axios.post(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: { user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', status: status } }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
        .then(async res => {
          const animeRes = await axios.get(`https://shikimori.io/api/animes/${animeId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
          const anime = animeRes.data
          let animeData = await getAnimeData(user, anime, animeId)
          bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
        })
        .catch(er => {
          console.log(er)
        })
    } else {
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      let needKeyboard = true
      if (list[0] != undefined) {
        let nowStatus = list[0].status
        if (nowStatus == 'completed') statusKeyboard.inline_keyboard[0][1].text = '✅ Просмотрено'
        if (nowStatus == 'watching') statusKeyboard.inline_keyboard[0][2].text = '✅ Смотрю'
        if (nowStatus == 'rewatching') statusKeyboard.inline_keyboard[1][0].text = '✅ Пересматриваю'
        if (nowStatus == 'planned') statusKeyboard.inline_keyboard[1][1].text = '✅ Запланировано'
        if (nowStatus == 'on_hold') statusKeyboard.inline_keyboard[1][2].text = '✅ Отложено'
        if (nowStatus == 'dropped') statusKeyboard.inline_keyboard[2][0].text = '✅ Брошено'
        if (selected == 6) {
          needKeyboard = false
          axios.delete(`https://shikimori.io/api/v2/user_rates/${list[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
            .then(async res => {
              const animeRes = await axios.get(`https://shikimori.io/api/animes/${animeId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
              const anime = animeRes.data
              let animeData = await getAnimeData(user, anime, animeId)
              bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
            })
            .catch(er => {
              console.log(er)
            })
        }
      } else {
        statusKeyboard.inline_keyboard[2] = statusKeyboard.inline_keyboard[2].filter(a => a.callback_data != 'status-6')
      }

      if (needKeyboard) bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(statusKeyboard))
    }
  }
  ctx.answerCbQuery(``)
})

bot.action(/^star-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let starKeyboard = {
    'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '0 ⭐', callback_data: `star-0`, hide: false }, { text: '1 ⭐', callback_data: `star-1`, hide: false }, { text: '2 ⭐', callback_data: `star-2`, hide: false }],
    [{ text: '3 ⭐', callback_data: `star-3`, hide: false }, { text: '4 ⭐', callback_data: `star-4`, hide: false }, { text: '5 ⭐', callback_data: `star-5`, hide: false }, { text: '6 ⭐', callback_data: `star-6`, hide: false }, { text: '7 ⭐', callback_data: `star-7`, hide: false }],
    [{ text: '8 ⭐', callback_data: `star-8`, hide: false }, { text: '9 ⭐', callback_data: `star-9`, hide: false }, { text: '10 ⭐', callback_data: `star-10`, hide: false }]
    ]
  }
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    if (selected != 20) {
      user = await getNewToken(user)
      axios.post(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: { user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', score: parseInt(selected) } }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
        .then(async res => {
          const animeRes = await axios.get(`https://shikimori.io/api/animes/${animeId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
          const anime = animeRes.data
          let animeData = await getAnimeData(user, anime, animeId)
          bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
        })
        .catch(er => {
          console.log(er)
        })
    } else {
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      if (list[0] != undefined) {
        let star = list[0].score
        if (star == 0) starKeyboard.inline_keyboard[0][1].text = '✅ 0 ⭐'
        if (star == 1) starKeyboard.inline_keyboard[0][2].text = '✅ 1 ⭐'
        if (star == 2) starKeyboard.inline_keyboard[0][3].text = '✅ 2 ⭐'
        if (star == 3) starKeyboard.inline_keyboard[1][0].text = '✅ 3 ⭐'
        if (star == 4) starKeyboard.inline_keyboard[1][1].text = '✅ 4 ⭐'
        if (star == 5) starKeyboard.inline_keyboard[1][2].text = '✅ 5 ⭐'
        if (star == 6) starKeyboard.inline_keyboard[1][3].text = '✅ 6 ⭐'
        if (star == 7) starKeyboard.inline_keyboard[1][4].text = '✅ 7 ⭐'
        if (star == 8) starKeyboard.inline_keyboard[2][0].text = '✅ 8 ⭐'
        if (star == 9) starKeyboard.inline_keyboard[2][1].text = '✅ 9 ⭐'
        if (star == 10) starKeyboard.inline_keyboard[2][2].text = '✅ 10 ⭐'
      }
      bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(starKeyboard))
    }
  }
  ctx.answerCbQuery(``)
})

bot.action(/^random_genres-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let randomSettings = getRandomSettings(msg.message.text)
  if (selected == 100 || selected == 101 || selected == 102 || selected == 103) {
    let genresKeyboard = {
      'inline_keyboard': [
        [{ text: '⛔️ Убрать', callback_data: `random_genres-0`, hide: false }, { text: 'Сёнен', callback_data: `random_genres-27`, hide: false }, { text: 'Сёнен-ай', callback_data: `random_genres-28`, hide: false }, { text: 'Сэйнэн', callback_data: `random_genres-42`, hide: false }],
        [{ text: 'Сёдзё', callback_data: `random_genres-25`, hide: false }, { text: 'Сёдзё-ай', callback_data: `random_genres-26`, hide: false }, { text: 'Дзёсей', callback_data: `random_genres-43`, hide: false }, { text: 'Комедия', callback_data: `random_genres-4`, hide: false }],
        [{ text: 'Романтика', callback_data: `random_genres-22`, hide: false }, { text: 'Школа', callback_data: `random_genres-23`, hide: false }, { text: 'Безумие', callback_data: `random_genres-5`, hide: false }, { text: 'Боевые искусства', callback_data: `random_genres-17`, hide: false }],
        [{ text: 'Вампиры', callback_data: `random_genres-32`, hide: false }, { text: 'Военное', callback_data: `random_genres-38`, hide: false }, { text: 'Гарем', callback_data: `random_genres-35`, hide: false }, { text: 'Далее ▶️', callback_data: `random_genres-101`, hide: false }],
      ]
    }
    if (selected == 101) {
      genresKeyboard = {
        'inline_keyboard': [
          [{ text: '◀️ Назад', callback_data: `random_genres-100`, hide: false }, { text: 'Хентай', callback_data: `random_genres-12`, hide: false }, { text: 'Этти', callback_data: `random_genres-9`, hide: false }, { text: 'Демоны', callback_data: `random_genres-6`, hide: false }],
          [{ text: 'Детектив', callback_data: `random_genres-7`, hide: false }, { text: 'Детское', callback_data: `random_genres-15`, hide: false }, { text: 'Драма', callback_data: `random_genres-8`, hide: false }, { text: 'Игры', callback_data: `random_genres-11`, hide: false }],
          [{ text: 'Исторический', callback_data: `random_genres-13`, hide: false }, { text: 'Космос', callback_data: `random_genres-29`, hide: false }, { text: 'Магия', callback_data: `random_genres-16`, hide: false }, { text: 'Машины', callback_data: `random_genres-3`, hide: false }],
          [{ text: 'М🤢ха', callback_data: `random_genres-18`, hide: false }, { text: 'Музыка', callback_data: `random_genres-19`, hide: false }, { text: 'Пародия', callback_data: `random_genres-20`, hide: false }, { text: 'Далее ▶️', callback_data: `random_genres-102`, hide: false }],
        ]
      }
    }
    if (selected == 102) {
      genresKeyboard = {
        'inline_keyboard': [
          [{ text: '◀️ Назад', callback_data: `random_genres-101`, hide: false }, { text: 'Повседневность', callback_data: `random_genres-36`, hide: false }, { text: 'Полиция', callback_data: `random_genres-39`, hide: false }, { text: 'Приключения', callback_data: `random_genres-2`, hide: false }],
          [{ text: 'Психологическое', callback_data: `random_genres-40`, hide: false }, { text: 'Работа', callback_data: `random_genres-541`, hide: false }, { text: 'Самураи', callback_data: `random_genres-21`, hide: false }, { text: 'Сверхъестественное', callback_data: `random_genres-37`, hide: false }],
          [{ text: 'Спорт', callback_data: `random_genres-30`, hide: false }, { text: 'Супер сила', callback_data: `random_genres-31`, hide: false }, { text: 'Ужасы', callback_data: `random_genres-14`, hide: false }, { text: 'Фантастика', callback_data: `random_genres-24`, hide: false }],
          [{ text: 'Фэнтези', callback_data: `random_genres-10`, hide: false }, { text: 'Экшен', callback_data: `random_genres-1`, hide: false }, { text: 'Гурман', callback_data: `random_genres-543`, hide: false }, { text: 'Далее ▶️', callback_data: `random_genres-103`, hide: false }],
        ]
      }
    }
    if (selected == 103) {
      genresKeyboard = {
        'inline_keyboard': [
          [{ text: '◀️ Назад', callback_data: `random_genres-102`, hide: false }, { text: 'Яой', callback_data: `random_genres-33`, hide: false }, { text: 'Юри', callback_data: `random_genres-34`, hide: false }],
        ]
      }
    }
    randomSettings.genres.forEach(genreId => {
      genresKeyboard.inline_keyboard.forEach(l => {
        l.forEach(k => {
          if (k.callback_data == `random_genres-${genreId}`) {
            k.text = `✅ ${k.text}`
          }
        })
      })
    })
    bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(genresKeyboard))
  } else {
    randomSettings = getRandomSettings(randomSettings.msg, 'genres', selected)
    axios.get(`https://shikimori.io/api/animes?limit=50&order=random${randomSettings.query}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      const anime = res.data
      let animeData = await getAnimeData(user, anime, randomRes.data[0].id, true, `${randomSettings.msg}`)
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${animeData.msg}\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    })
      .catch(er => {
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `Не смогло найти аниме по заданым фильтрам ;c\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify({}) })
      })
  }
  ctx.answerCbQuery(``)
})

bot.action(/^random_status-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let statusKeyboard = {
    'inline_keyboard': [
      [{ text: '⛔️ Убрать', callback_data: `random_status-0`, hide: false }],
      [{ text: 'Анонсировано', callback_data: `random_status-1`, hide: false }, { text: 'Сейчас выходит', callback_data: `random_status-2`, hide: false }],
      [{ text: 'Вышедшее', callback_data: `random_status-3`, hide: false }]
    ]
  }
  let selectedStatus = undefined
  if (selected == 1) selectedStatus = 'anons'
  if (selected == 2) selectedStatus = 'ongoing'
  if (selected == 3) selectedStatus = 'released'
  let randomSettings = getRandomSettings(msg.message.text)
  if (randomSettings.status == 'anons') statusKeyboard.inline_keyboard[1][0].text = '✅ Анонсировано'
  if (randomSettings.status == 'ongoing') statusKeyboard.inline_keyboard[1][1].text = '✅ Сейчас выходит'
  if (randomSettings.status == 'released') statusKeyboard.inline_keyboard[2][0].text = '✅ Вышедшее'
  if (selected != 20) {
    randomSettings = getRandomSettings(msg.message.text, 'status', selectedStatus)
    axios.get(`https://shikimori.io/api/animes?limit=50&order=random${randomSettings.query}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      const anime = res.data
      let animeData = await getAnimeData(user, anime, randomRes.data[0].id, true, `${randomSettings.msg}`)
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${animeData.msg}\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    })
      .catch(er => {
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `Не смогло найти аниме по заданым фильтрам ;c\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify({}) })
      })
  } else {
    bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(statusKeyboard))
  }
  ctx.answerCbQuery(``)
})

bot.action(/^random_kind-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let kindKeyboard = {
    'inline_keyboard': [
      [{ text: '⛔️ Убрать', callback_data: `random_kind-0`, hide: false }, { text: 'TV', callback_data: `random_kind-1`, hide: false }, { text: 'Фильм', callback_data: `random_kind-2`, hide: false }],
      [{ text: 'OVA', callback_data: `random_kind-3`, hide: false }, { text: 'ONA', callback_data: `random_kind-4`, hide: false }, { text: 'Спешл', callback_data: `random_kind-5`, hide: false }, { text: 'Музыка', callback_data: `random_kind-6`, hide: false }],
      [{ text: 'TV_13', callback_data: `random_kind-7`, hide: false }, { text: 'TV_24', callback_data: `random_kind-8`, hide: false }, { text: 'TV_48', callback_data: `random_kind-9`, hide: false }]
    ]
  }
  let selectedKind = undefined
  if (selected == 1) selectedKind = 'tv'
  if (selected == 2) selectedKind = 'movie'
  if (selected == 3) selectedKind = 'ova'
  if (selected == 4) selectedKind = 'ona'
  if (selected == 5) selectedKind = 'special'
  if (selected == 6) selectedKind = 'music'
  if (selected == 7) selectedKind = 'tv_13'
  if (selected == 8) selectedKind = 'tv_24'
  if (selected == 9) selectedKind = 'tv_48'
  let randomSettings = getRandomSettings(msg.message.text)
  if (randomSettings.kind == 'tv') kindKeyboard.inline_keyboard[0][1].text = '✅ TV'
  if (randomSettings.kind == 'movie') kindKeyboard.inline_keyboard[0][2].text = '✅ Фильм'
  if (randomSettings.kind == 'ova') kindKeyboard.inline_keyboard[1][0].text = '✅ OVA'
  if (randomSettings.kind == 'ona') kindKeyboard.inline_keyboard[1][1].text = '✅ ONA'
  if (randomSettings.kind == 'special') kindKeyboard.inline_keyboard[1][2].text = '✅ Спешл'
  if (randomSettings.kind == 'music') kindKeyboard.inline_keyboard[1][3].text = '✅ Музыка'
  if (randomSettings.kind == 'tv_13') kindKeyboard.inline_keyboard[2][0].text = '✅ TV_13'
  if (randomSettings.kind == 'tv_24') kindKeyboard.inline_keyboard[2][1].text = '✅ TV_24'
  if (randomSettings.kind == 'tv_48') kindKeyboard.inline_keyboard[2][2].text = '✅ TV_48'
  if (selected != 20) {
    randomSettings = getRandomSettings(msg.message.text, 'kind', selectedKind)
    axios.get(`https://shikimori.io/api/animes?limit=50&order=random${randomSettings.query}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      const anime = res.data
      let animeData = await getAnimeData(user, anime, randomRes.data[0].id, true, `${randomSettings.msg}`)
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${animeData.msg}\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    })
      .catch(er => {
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `Не смогло найти аниме по заданым фильтрам ;c\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify({}) })
      })
  } else {
    bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(kindKeyboard))
  }
  ctx.answerCbQuery(``)
})

bot.action(/^random_min_star-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let starKeyboard = {
    'inline_keyboard': [
      [{ text: '⛔️ Убрать', callback_data: `random_min_star-0`, hide: false }, { text: '1 ⭐', callback_data: `random_min_star-1`, hide: false }, { text: '2 ⭐', callback_data: `random_min_star-2`, hide: false }],
      [{ text: '3 ⭐', callback_data: `random_min_star-3`, hide: false }, { text: '4 ⭐', callback_data: `random_min_star-4`, hide: false }, { text: '5 ⭐', callback_data: `random_min_star-5`, hide: false }, { text: '6 ⭐', callback_data: `random_min_star-6`, hide: false }],
      [{ text: '7 ⭐', callback_data: `random_min_star-7`, hide: false }, { text: '8 ⭐', callback_data: `random_min_star-8`, hide: false }, { text: '9 ⭐', callback_data: `random_min_star-9`, hide: false }]
    ]
  }
  let randomSettings = getRandomSettings(msg.message.text)
  if (randomSettings.star == 1) starKeyboard.inline_keyboard[0][1].text = '✅ 1 ⭐'
  if (randomSettings.star == 2) starKeyboard.inline_keyboard[0][2].text = '✅ 2 ⭐'
  if (randomSettings.star == 3) starKeyboard.inline_keyboard[1][0].text = '✅ 3 ⭐'
  if (randomSettings.star == 4) starKeyboard.inline_keyboard[1][1].text = '✅ 4 ⭐'
  if (randomSettings.star == 5) starKeyboard.inline_keyboard[1][2].text = '✅ 5 ⭐'
  if (randomSettings.star == 6) starKeyboard.inline_keyboard[1][3].text = '✅ 6 ⭐'
  if (randomSettings.star == 7) starKeyboard.inline_keyboard[2][0].text = '✅ 7 ⭐'
  if (randomSettings.star == 8) starKeyboard.inline_keyboard[2][1].text = '✅ 8 ⭐'
  if (randomSettings.star == 9) starKeyboard.inline_keyboard[2][2].text = '✅ 9 ⭐'
  if (selected != 20) {
    randomSettings = getRandomSettings(msg.message.text, 'star', parseInt(selected))
    axios.get(`https://shikimori.io/api/animes?limit=50&order=random${randomSettings.query}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } }).then(async randomRes => {
      let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
      const res = await axios.get(`https://shikimori.io/api/animes/${randomRes.data[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
      const anime = res.data
      let animeData = await getAnimeData(user, anime, randomRes.data[0].id, true, `${randomSettings.msg}`)
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${animeData.msg}\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    })
      .catch(er => {
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `Не смогло найти аниме по заданым фильтрам ;c\n${randomSettings.msg}`, { parse_mode: 'HTML', reply_markup: JSON.stringify({}) })
      })
  } else {
    bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(starKeyboard))
  }
  ctx.answerCbQuery(``)
})

bot.on('message', async (ctx) => {
  let query = ctx.message.text
  if (ctx.message.from.id == ctx.message.chat.id && !ctx.message.caption) {
    if (query.includes('Чтобы узнать больше')) return ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
    let search = `https://shikimori.io/api/animes/?limit=50&search=${encodeURI(query)}&order=ranked`
    let characters = false
    if (query.includes('c:')) {
      query = query.split('c:')[1]
      characters = true
    }
    if (query.includes('с:')) {
      query = query.split('с:')[1]
      characters = true
    }
    if (characters) search = `https://shikimori.io/api/characters/search?search=${encodeURI(query)}&limit=10`
    let result = []
    let res = await axios.get(search, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })

    res.data.forEach(async (anime, ind) => {
      let line = ''
      if (characters) {
        line = `<a href="https://shikimori.io/animes/${anime.url}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a> <code>/charactersbyid ${anime.id}</code> `
      } else {
        line = `<a href="https://shikimori.io/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a> <b>${anime.score}</b> ⭐ ${anime.kind?.toUpperCase()} <code>/findbyid ${anime.id}</code> `
      }
      result.push(line)
    })
    ctx.reply(`${result.slice(0, 10).join('\n')} \n\n<b>Чтобы открыть аниме, нажмите на команду (/findbyid или /charactersbyid) и вставьте в ЛС бота.</b>`, { parse_mode: 'HTML', disable_web_page_preview: true })
  }
  if (ctx.message.photo && ctx.message.caption == '/anime') {
    let fileId = ctx.message.photo.pop().file_id
    try {
      bot.telegram.getFileLink(fileId).then(async file => {
        let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
        let result = await axios.get(`https://api.trace.moe/search?url=${encodeURIComponent(file.href)}`)
        let animeName = result.data.result[0].filename
        if (animeName.includes(']')) animeName = animeName.split(']')[1]
        animeName = animeName.replace(/\s+/g, ' ').trim()
        const res = await axios.get(`https://shikimori.io/api/animes/?limit=50&search=${encodeURIComponent(animeName)}&order=popularity`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
        let stringSimilarity = require("string-similarity")
        const names = res.data.map(a => a.name)
        let best = stringSimilarity.findBestMatch(animeName, names)
        const animeRes = await axios.get(`https://shikimori.io/api/animes/${encodeURIComponent(res.data[best.bestMatchIndex].id)}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
        const anime = animeRes.data
        let animeData = await getAnimeData(user, anime, res.data[0].id)
        ctx.reply(animeData.msg + `\nСовпадение: ${(result.data.result[0].similarity * 100).toFixed(1)}%\nСерия: ${parseInt(result.data.result[0].episode)}\nВремя: ${toHHMMSS(result.data.result[0].from)}`, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
      })
    } catch (er) {
      ctx.reply('Ошибка: ' + er)
    }
  }
})

let lastQuery = []

bot.on('inline_query', async (ctx) => {
  try {
    let query = ctx.update.inline_query.query
    let search = `https://shikimori.io/api/animes/?limit=50&search=${encodeURI(query)}&order=ranked`
    let characters = false
    if (query.includes('c:')) {
      query = query.split('c:')[1]
      characters = true
    }
    if (query.includes('с:')) {
      query = query.split('с:')[1]
      characters = true
    }
    if (characters) search = `https://shikimori.io/api/characters/search?search=${encodeURI(query)}`
    let result = []
    let res = await axios.get(search, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })

    res.data.forEach(async (anime, ind) => {
      let obj = {}
      if (characters) {
        obj = {
          type: 'article',
          id: (new Date()).getTime().toString(36) + (Math.random() * ind).toString(36).slice(2),
          animeId: anime.id,
          title: `${anime.name}`,
          description: `${anime.russian}`,
          thumb_url: `https://shikimori.io${anime.image.x48}`,
          input_message_content: {
            message_text: `<a href="https://shikimori.io${anime.image.original}">\n</a><a href="https://shikimori.io/animes/${anime.url}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
CID: ${anime.id}
            
Чтобы узнать больше, напишите боту в ЛС:
<code>/charactersbyid ${anime.id}</code>`,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          }
        }
      } else {
        obj = {
          type: 'article',
          id: (new Date()).getTime().toString(36) + (Math.random() * ind).toString(36).slice(2),
          animeId: anime.id,
          title: `${anime.name}`,
          description: `${anime.russian ? anime.russian : ''}`,
          thumb_url: `https://shikimori.io${anime.image.x48}`,
          input_message_content: {
            message_text: `<a href="https://shikimori.io/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
ID: ${anime.id}
Тип: ${anime.kind?.toUpperCase()}<a href="${`https://shikimori.io${anime.image.original}`}">\n</a>
Чтобы узнать больше, напишите боту в ЛС:
<code>/findbyid ${anime.id}</code>`,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          },
        }
      }
      result.push(obj)
    })

    if (result.length > 0) {
      lastQuery = result
      return ctx.answerInlineQuery(result)
    }
  } catch (er) {
    console.log(er)
  }
})

// let lastDownloadAnimeList = []
// let nowDownload = false
// let isCancel = false
// let startDownload = null

// bot.action('list_download', async (ctx) => {
//   try {
//     let msg = ctx.update.callback_query
//     let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
//     let name = msg.message.text.split('\n')[0]
//     const { data: kodik } = await axios.get(`https://kodik-api.com/search?token=${process.env.KODIK}&shikimori_id=${animeId}&with_seasons=true&with_episodes=true`)
//     let animeKeyboard = {
//       'inline_keyboard': [
//         [{ text: '◀️ Назад', callback_data: 'about', hide: false }],
//       ]
//     }
//     let row = 0
//     lastDownloadAnimeList = []
//     kodik.results.forEach(async (a, ind) => {
//       let have = false
//       let zip = path.normalize(`./anime/${a.title_orig.replace(/[/\\?%*:|"<>]/g, '')}(${a.translation.title}).zip`)
//       if (fs.existsSync(zip)) have = true
//       let episodesLinks = [`https://shiki.sgezha.ru/kodik?video=${a.link}&title=${a.title_orig}`]
//       if (a.seasons) episodesLinks = Object.keys(a.seasons[a.last_season].episodes).map(key => `https://shiki.sgezha.ru/kodik?video=${a.seasons[a.last_season].episodes[key]}&title=${a.title_orig}`)
//       lastDownloadAnimeList.push({
//         episodesLinks,
//         author: a.translation.title,
//         title: a.title_orig.replace(/[/\\?%*:|"<>]/g, '')
//       })
//       animeKeyboard.inline_keyboard[row].push({
//         text: `${have ? '✅ ' : ''}${a.translation.title}(${a.translation.type})`,
//         callback_data: `download_anime-${ind}`,
//         hide: false
//       })
//       if (animeKeyboard.inline_keyboard[row].length > 2) {
//         animeKeyboard.inline_keyboard.push([])
//         row++
//       }
//     })
//     bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>Выберите студию:</b> \n✅ - аниме уже скачано ботом`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
//     ctx.answerCbQuery(``)
//   } catch (er) {
//     console.log(er)
//   }
// })

// bot.action(/^download_anime-(\d+)$/, async (ctx) => {
//   try {
//     let msg = ctx.update.callback_query
//     let select = ctx.match[1]
//     let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
//     let name = msg.message.text.split('\n')[0]
//     if (!lastDownloadAnimeList) return
//     // lastDownloadAnimeList[select].episodesLinks = lastDownloadAnimeList[select].episodesLinks.slice(0, 2)
//     let dir = path.normalize(`./anime/${lastDownloadAnimeList[select].title}(${lastDownloadAnimeList[select].author})`)
//     let zip = path.normalize(`./anime/${lastDownloadAnimeList[select].title}(${lastDownloadAnimeList[select].author}).zip`)
//     startDownload = Date.now()
//     if (!fs.existsSync(zip)) {
//       if (nowDownload) {
//         ctx.answerCbQuery('Сейчас бот занят загрузкой другого аниме, подождите пожалуйста 🥺')
//         return
//       } else {
//         fs.ensureDirSync(dir)
//         queueAnime(lastDownloadAnimeList[select], 0, msg, name, animeId)
//         bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}<b>\n\nНачало скачивание аниме</b> \nЗатраченное время: ${msToTime(startDownload, Date.now())}`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({}) })
//       }
//     } else {
//       bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>✅ Загрузка завершена, можете скачивать 😎</b>`, {
//         disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({
//           'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '📥 Скачать', url: `https://shiki.sgezha.ru/${lastDownloadAnimeList[select].title}(${lastDownloadAnimeList[select].author}).zip`, hide: false }]]
//         })
//       })
//     }
//     ctx.answerCbQuery(``)
//   } catch (er) {
//     console.log(er)
//   }
// })

// bot.action('cancel_download', async (ctx) => {
//   try {
//     let msg = ctx.update.callback_query
//     let select = ctx.match[1]
//     let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
//     let name = msg.message.text.split('\n')[0]
//     if (nowDownload) {
//       isCancel = true
//       ctx.answerCbQuery(`Подождите пару секунд, пока бот закончит загрузку серии и остановит загрузку аниме`)
//     } else {
//       ctx.answerCbQuery(`Загрузка не найдена`)
//     }
//   } catch (er) {
//     console.log(er)
//   }
// })

// async function queueAnime(animeArray, id, msg, name, animeId) {
//   if (!animeArray) return
//   if (isCancel) {
//     bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>⛔️ Загрузка отменена</b>`, {
//       disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({
//         'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }]]
//       })
//     })
//     isCancel = false
//     lastDownloadAnimeList = []
//     nowDownload = false
//     fs.rmSync(`anime/${animeArray.title}(${animeArray.author})`, { recursive: true, force: true })
//     return
//   }
//   if (animeArray.episodesLinks.length == id) {
//     bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>📂 Происходит запаковка аниме в zip, подождите пару минут </b> \nЗатраченное время: ${msToTime(startDownload, Date.now())}`, {
//       disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({})
//     })
//     zipDirectory(`anime/${animeArray.title}(${animeArray.author})`, `anime/${animeArray.title}(${animeArray.author}).zip`, msg, name, animeId, animeArray.episodesLinks.length).then(res => {
//       nowDownload = false
//       fs.rmSync(`anime/${animeArray.title}(${animeArray.author})`, { recursive: true, force: true })
//       bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>✅ Загрузка завершена, можете скачивать 😎</b> \nЗатраченное время: ${msToTime(startDownload, Date.now())}`, {
//         disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({
//           'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '📥 Скачать', url: `https://shiki.sgezha.ru/${animeArray.title}(${animeArray.author}).zip`, hide: false }]]
//         })
//       })
//     })
//     return
//   }
//   try {
//     nowDownload = true
//     let m3u8File = await getM3u8(animeArray.episodesLinks[id])
//     bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>Загрузка ${id + 1}/${animeArray.episodesLinks.length} серии</b> \nЗатраченное время: ${msToTime(startDownload, Date.now())}`, {
//       disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({
//         inline_keyboard: [[{ text: '⛔️ Отменить загрузку', callback_data: 'cancel_download', hide: false }]]
//       })
//     })

//     ffmpeg()
//       .input(m3u8File)
//       .outputOptions('-c copy')
//       .outputOptions('-bsf:a aac_adtstoasc')
//       .save(`anime/${animeArray.title}(${animeArray.author})/${animeArray.title}(${animeArray.author}) ${id + 1}.mp4`)
//       .on('progress', (res) => {

//       })
//       .on('end', () => {
//         queueAnime(animeArray, id + 1, msg, name, animeId)
//       })
//       .on('error', (err) => {
//         nowDownload = false
//         bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>Произошла ошибка 😢 \n${err} серии</b> `, {
//           disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({
//             'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '📥 Скачать', url: `https://shiki.sgezha.ru/${animeArray.title}(${animeArray.author}).zip`, hide: false }]]
//           })
//         })
//       })
//   } catch (er) {
//     nowDownload = false
//     console.log(er)
//   }
// }

// async function zipDirectory(sourceDir, outPath, msg, name, animeId, episodes) {
//   const archive = archiver('zip', { zlib: { level: 9 } })
//   const stream = fs.createWriteStream(outPath)

//   return new Promise((resolve, reject) => {
//     archive
//       .directory(sourceDir, false)
//       .on("progress", (progress) => {
//         bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\nID: ${animeId}\n\n<b>📂 Происходит запаковка аниме в zip: ${progress.entries.processed}/${episodes}</b> \nЗатраченное время: ${msToTime(startDownload, Date.now())}`, {
//           disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({})
//         })
//       })
//       .on('error', err => reject(err))
//       .pipe(stream)

//     stream.on('close', () => resolve())
//     archive.finalize()
//   })
// }

// async function getM3u8(url, info) {
//   const findFrame = (frames, name) => {
//     return frames.find(f => f.name() === name)
//   }

//   return new Promise(async resolve => {
//     try {
//       let browser = await puppeteer.launch({
//         headless: true,
//         args: [
//           '--no-sandbox',
//           '--disable-web-security',
//           '--disable-features=IsolateOrigins,site-per-process'
//         ],
//         executablePath: '/usr/bin/google-chrome-stable'
//         // executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
//       })
//       const [page] = await browser.pages()
//       await page.setRequestInterception(true)
//       page.on('response', async (res) => { })
//       page.on('requestfailed', (res) => { })
//       page.on('request', async (res) => {
//         if (res.url().includes('m3u8')) {
//           let resultUrl = res.url().split('360.mp4').join('720.mp4')
//           resolve(resultUrl)
//           await browser.close()
//         }
//         res.continue()
//       })
//       await page.goto(url)
//       const targetFrame = findFrame(page.frames(), 'anime')
//       await targetFrame.waitForSelector('.play_button')
//       await targetFrame.click('.play_button')
//     } catch (er) {
//       console.log(er)
//     }
//   })
// }

bot.action(/^watch-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let epidose = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    user = await getNewToken(user)
    axios.post(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: { user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', episodes: parseInt(epidose), status: 'watching' } }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      .then(async postRes => {
        let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
        let episode = +ctx.match[0].split('-')[1]
        let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
        let shiki = []
        let kodik = []
        try {
          const { data: shikiPending } = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' } })
          shiki = shikiPending
        } catch (er) {
          console.log(er)
        }
        try {
          const { data: kodikPending } = await axios.get(`https://kodik-api.com/search?token=${process.env.KODIK}&shikimori_id=${animeId}&with_seasons=true&with_episodes=true`)
          kodik = kodikPending
        } catch (er) {
          console.log(er)
        }
        let episodeText = getEpisode(shiki, kodik, episode, 0)
        console.log(episodeText)
        let animeKeyboard = {
          'inline_keyboard': [
            [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '✅ Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: 'Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: 'Оригинал', callback_data: `list_original-${episode}`, hide: false }],
            [{}, {}, {}, {}],
            [{}, {}, {}, {}],
            [{}, {}, {}, {}],
          ]
        }
        let episodesNow = episode
        if (episode != 1) episodesNow -= 4
        if (episodesNow <= 0) episodesNow = 1
        for (let i = 1; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ ' : ''}${episodesNow} серия`
            animeKeyboard.inline_keyboard[i][j].callback_data = `list_dub-${episodesNow}`
            animeKeyboard.inline_keyboard[i][j].hide = `false`
            episodesNow++
          }
        }
        if (user != undefined) {
          const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
          if (list.length > 0) {
            animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
          } else {
            animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
          }
        }
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
        ctx.answerCbQuery(``)
      })
      .catch(er => {
        console.log(er)
      })
  }
})

bot.action(/^list_dub-(\d+)$/, async (ctx) => {
  try {
    let msg = ctx.update.callback_query
    let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
    let name = msg.message.text.split('\n')[0]
    let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
    let episode = +ctx.match[0].split('-')[1]
    let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
    let shiki = []
    let kodik = []
    try {
      const { data: shikiPending } = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' } })
      shiki = shikiPending
    } catch (er) {
      console.log(er)
    }
    try {
      const { data: kodikPending } = await axios.get(`https://kodik-api.com/search?token=${process.env.KODIK}&shikimori_id=${animeId}&with_seasons=true&with_episodes=true`)
      kodik = kodikPending
    } catch (er) {
      console.log(er)
    }
    let episodeText = getEpisode(shiki, kodik, episode, 0)
    let animeKeyboard = {
      'inline_keyboard': [
        [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '✅ Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: 'Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: 'Оригинал', callback_data: `list_original-${episode}`, hide: false }],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
      ]
    }
    let episodesNow = episode
    if (episode != 1) episodesNow -= 4
    if (episodesNow <= 0) episodesNow = 1
    for (let i = 1; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ ' : ''}${episodesNow} серия`
        animeKeyboard.inline_keyboard[i][j].callback_data = `list_dub-${episodesNow}`
        animeKeyboard.inline_keyboard[i][j].hide = `false`
        episodesNow++
      }
    }
    if (user != undefined) {
      user = await getNewToken(user)
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      if (list.length > 0 && list[0].episodes >= episode) {
        animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
      } else {
        animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
      }
    }
    // if (parseInt(maxEpidose) <= 70) {
    //   animeKeyboard.inline_keyboard.push([{ text: `💾 Скачать аниме`, callback_data: `list_download`, hide: false }])
    // }
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
    ctx.answerCbQuery(``)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.action(/^list_sub-(\d+)$/, async (ctx) => {
  try {
    let msg = ctx.update.callback_query
    let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
    let name = msg.message.text.split('\n')[0]
    let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
    let episode = +ctx.match[0].split('-')[1]
    let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
    let shiki = []
    let kodik = []
    try {
      const { data: shikiPending } = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' } })
      shiki = shikiPending
    } catch (er) {
      console.log(er)
    }
    try {
      const { data: kodikPending } = await axios.get(`https://kodik-api.com/search?token=${process.env.KODIK}&shikimori_id=${animeId}&with_seasons=true&with_episodes=true`)
      kodik = kodikPending
    } catch (er) {
      console.log(er)
    }
    let episodeText = getEpisode(shiki, kodik, episode, 1)
    let animeKeyboard = {
      'inline_keyboard': [
        [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: '✅ Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: 'Оригинал', callback_data: `list_original-${episode}`, hide: false }],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
      ]
    }
    let episodesNow = episode
    if (episode != 1) episodesNow -= 4
    if (episodesNow <= 0) episodesNow = 1
    for (let i = 1; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ ' : ''}${episodesNow} серия`
        animeKeyboard.inline_keyboard[i][j].callback_data = `list_sub-${episodesNow}`
        animeKeyboard.inline_keyboard[i][j].hide = `false`
        episodesNow++
      }
    }
    if (user != undefined) {
      user = await getNewToken(user)
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      if (list.length > 0 && list[0].episodes >= episode) {
        animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
      } else {
        animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
      }
    }
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
    ctx.answerCbQuery(``)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.action(/^list_original-(\d+)$/, async (ctx) => {
  try {
    let msg = ctx.update.callback_query
    let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
    let name = msg.message.text.split('\n')[0]
    let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
    let episode = +ctx.match[0].split('-')[1]
    let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
    let shiki = []
    let kodik = []
    try {
      const { data: shikiPending } = await axios.get(`https://smarthard.net/api/shikivideos/${animeId}?episode=${episode}&limit=all`, { headers: { 'User-Agent': 'TELEGRAM_BOT_4FUN' } })
      shiki = shikiPending
    } catch (er) {
      console.log(er)
    }
    try {
      const { data: kodikPending } = await axios.get(`https://kodik-api.com/search?token=${process.env.KODIK}&shikimori_id=${animeId}&with_seasons=true&with_episodes=true`)
      kodik = kodikPending
      console.log(kodik)
    } catch (er) {
      console.log(er)
    }
    let episodeText = getEpisode(shiki, kodik, episode, 2)
    let animeKeyboard = {
      'inline_keyboard': [
        [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Озвучка', callback_data: `list_dub-${episode}`, hide: false }, { text: 'Субтитры', callback_data: `list_sub-${episode}`, hide: false }, { text: '✅ Оригинал', callback_data: `list_original-${episode}`, hide: false }],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
        [{}, {}, {}, {}],
      ]
    }
    let episodesNow = episode
    if (episode != 1) episodesNow -= 4
    if (episodesNow <= 0) episodesNow = 1
    for (let i = 1; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        animeKeyboard.inline_keyboard[i][j].text = `${episodesNow == episode ? '✅ ' : ''}${episodesNow} серия`
        animeKeyboard.inline_keyboard[i][j].callback_data = `list_original-${episodesNow}`
        animeKeyboard.inline_keyboard[i][j].hide = `false`
        episodesNow++
      }
    }
    if (user != undefined) {
      user = await getNewToken(user)
      const { data: list } = await axios.get(`https://shikimori.io/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
      if (list.length > 0 && list[0].episodes >= episode) {
        animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
      } else {
        animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
      }
    }
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
    ctx.answerCbQuery(``)
  } catch (er) {
    ctx.reply(`Ошибка при получении данных аниме. Попробуйте еще раз.\nЕсли ошибка повторяется, обратитесь к создателю бота.\n${er}`)
  }
})

bot.on('chosen_inline_result', async ({ chosenInlineResult }) => {
  let article = lastQuery.find(a => a.id == chosenInlineResult.result_id)
  let msgText = article.input_message_content.message_text
  if (!msgText.includes('CID:')) {
    let animeId = msgText.split('ID: ')[1].split('\n')[0]
    let user = db.get('profiles').value().find(a => { if (chosenInlineResult.from.id == a.telegram_id) return true })
    const res = await axios.get(`https://shikimori.io/api/animes/${animeId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    const anime = res.data
    let animeData = await getAnimeData(user, anime, animeId)
    bot.telegram.sendMessage(chosenInlineResult.from.id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
  } else {
    let characterId = msgText.split('CID: ')[1].split('\n')[0]
    const res = await axios.get(`https://shikimori.io/api/characters/${characterId}`, { headers: { 'User-Agent': 'anime4funbot - Telegram' } })
    const character = res.data
    bot.telegram.sendMessage(chosenInlineResult.from.id, `<a href="https://shikimori.io${character.url}"><b>${character.name}</b> ${character.russian ? '(' + character.russian + ')' : ''}</a><a href="https://shikimori.io${character.image.original}">\n</a>${character.description ? (character.description.replace(/([\[]*)\[(.*?)\]/gm, '').length > 299) ? character.description.replace(/([\[]*)\[(.*?)\]/gm, '').slice(0, 300) + '...' : character.description.replace(/([\[]*)\[(.*?)\]/gm, '') : ''}

<b>СЭЙЮ:</b> ${character.seyu.map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).join(', ')}
<b>Аниме:</b> ${character.animes.slice(0, 5).map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).join(', ')}
<b>Манга:</b> ${character.mangas.slice(0, 5).map(a => `<a href="https://shikimori.io${a.url}">${a.name} ${a.russian ? '(' + a.russian + ')' : ''}</a>`).slice(0, 30).join(', ')}
    `, { parse_mode: 'HTML', disable_web_page_preview: false })
  }
})

bot.catch((err) => {
  console.error('Ooops', err)
  // process.exit(1)  
})

// Enable graceful stop
// process.once('SIGINT', () => bot.stop('SIGINT'))
// process.once('SIGTERM', () => bot.stop('SIGTERM'))
