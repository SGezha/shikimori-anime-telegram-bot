const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
require('dotenv').config()
const fs = require('fs')

const express = require('express')
const app = express()
const port = 7276
const qs = require('querystring')
const passport = require('passport')
const { Strategy } = require('passport-shikimori')
let lastTGid = 0

const StormDB = require("stormdb");
const engine = new StormDB.localFileEngine("./db.stormdb");
const db = new StormDB(engine);
db.default({ profiles: [] });

passport.use(new Strategy(
	{
		clientID: 'JKQWvr99tmLsiO28lerI4rADSicAbYlt3wPQ453aaaY',
		clientSecret: 'I8pgivvnVqNkjUm7D2nHSyumU7d5w_H6P2Y998JauJw',
		callbackURL: 'https://animebot.smotrel.net/auth/shikimori/callback',
		scope: ['user_rates']
	},
	(accessToken, refreshToken, profile, done) => {
    let obj = {
      telegram_id: lastTGid,
      shikimori_id: profile.id,
      nickname: profile.nickname,
      token: accessToken,
    }
    if (db.get('profiles').value().find(a => { if (a.lastTGid == obj.telegram_id) return true }) == undefined) {
      db.get('profiles').push(obj).save();
      bot.telegram.sendMessage(lastTGid, `Вы авторизовались в Shikimori под ником ${profile.nickname}. Теперь можете пользоваться ботом`).then(res => {
        bot.telegram.sendMessage(lastTGid, `<a href="${profile.url}"><b>${profile.nickname}</b></a><a href="${profile.image.x160}">\n</a>Последняя активность: ${new Date(profile.last_online_at).toLocaleDateString()}\nВозраст: ${profile.full_years}`, { parse_mode: 'HTML' })
      })
    }
    done(null)
	}
));

app.get('/authorize', (req, res) => {
  const req_data = qs.parse(req.url.split('?')[1]);

  res.cookie('id', req_data.id, {
    maxAge: 86400 * 1000, // 24 hours
    httpOnly: true, // http only, prevents JavaScript cookie access
    secure: true // cookie must be sent over https / ssl
  });

  lastTGid = req_data.id

  res.redirect('/auth/shikimori');
});

app.get('/auth/shikimori', passport.authenticate('shikimori'));
app.get('/auth/shikimori/callback',
	passport.authenticate('shikimori', {
		failureRedirect: '/'
	}),
	(req, res) => {
		res.redirect('/result') // Successful auth
	}
);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port http://localhost:${port}`)
})

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.launch()

bot.start(async (ctx) => {
  let msgText = ctx.message.text
  if(ctx.from.id != ctx.chat.id) return
  ctx.reply(`Привет, это бот для просмотра аниме с возможностью синхранизации данных с шикимори.\nБот использует базу данных <a href="https://shikimori.one">Shikimori.one</a> и базу видео <a href="https://chrome.google.com/webstore/detail/shikicinema/hmbjohbggdnlpmokjbholpgegcdbehjp?hl=ru">Shikicinema</a> \nДля синхранизации данных в шикимори нажмите кнопки внизу.`, { disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: '⚙️ Пройти авторизацию на шикимори', url: `https://animebot.smotrel.net/authorize?id=${ctx.from.id}`, hide: false }]] }) })
})

bot.command('auth', async (ctx) => {
  let msgText = ctx.message.text
  if(ctx.from.id != ctx.chat.id) return
  ctx.reply(`Для авторизации в шикимори нажмите кнопки внизу.`, { parse_mode: 'HTML', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: '⚙️ Пройти авторизацию на шикимори', url: `https://animebot.smotrel.net/authorize?id=${ctx.from.id}`, hide: false }]] }) })
})

bot.command('random', async (ctx) => {
  let msgText = ctx.message.text
  let randomPage = getRandomInt(0, 346)
  let randomAnime = getRandomInt(0, 49)
  axios.get(`https://shikimori.one/api/animes?page=346&limit=50`).then(async randomRes => {
    let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
    const res = await axios.get(`https://shikimori.one/api/animes/${randomRes.data[randomAnime].id}`)
    const anime = res.data
    let animeData = await getAnimeData(user, anime, msgText.split(' ')[1], true)
    ctx.reply(animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
  })
})

bot.command('findbyid', async (ctx) => {
  let msgText = ctx.message.text
  if(msgText.split(' ')[1] == undefined) return ctx.reply('Неверный формат команды. \nПример команды: /findbyid <id>')
  let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
  const res = await axios.get(`https://shikimori.one/api/animes/${msgText.split(' ')[1]}`)
  const anime = res.data
  let animeData = await getAnimeData(user, anime, msgText.split(' ')[1])
  ctx.reply(animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
  ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
})

bot.command('profile', async (ctx) => {
  let msgText = ctx.message.text
  let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
  if(msgText.split(' ')[1] != undefined) user.nickname = msgText.split(' ')[1]
  if (user != undefined) {
    const { data: profile } = await axios.get(`https://shikimori.one/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${profile.id}&limit=1000&status=watching`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    const { data: animeList } = await axios.get(`https://shikimori.one/api/animes?ids=${list.map(id => id.target_id).join(',')}&limit=50`)
    let nowText = `\nСейчас смотрит: `
    list.slice(0, 5).forEach(async (a, ind) => {
      let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
      if(animeData) nowText += `\n<a href="https://shikimori.one/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
    })
    let animeKeyboard = {'inline_keyboard': [
      [{ text: '✅ Профиль', callback_data: `profile-${profile.id}`, hide: false }, { text: 'Список просмотренного', callback_data: `profile_completed-${profile.id}`, hide: false }],
    ]}

    ctx.reply(`<a href="${profile.url}"><b>${profile.nickname}</b></a><a href="${profile.image.x160}">\n</a>Последняя активность: ${new Date(profile.last_online_at).toLocaleDateString()}\nВозраст: ${profile.full_years}\n${nowText}`
    , { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard) })
  } else {
    ctx.reply(`Для авторизации введите команду /auth (Работает только в личных сообщениях).`)
  }
  ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
})

bot.action('random', async (ctx) => {
  let msg = ctx.update.callback_query
  let randomPage = getRandomInt(0, 346)
  let randomAnime = getRandomInt(0, 49)
  axios.get(`https://shikimori.one/api/animes?page=346&limit=50`).then(async randomRes => {
    let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
    const res = await axios.get(`https://shikimori.one/api/animes/${randomRes.data[randomAnime].id}`)
    const anime = res.data
    let animeData = await getAnimeData(user, anime, randomRes.data[randomAnime].id, true)
    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
  })
  ctx.answerCbQuery(``)
})

bot.action('about', async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let user = db.get('profiles').value().find(a => { if (ctx.from.id == a.telegram_id) return true })
  const res = await axios.get(`https://shikimori.one/api/animes/${animeId}`)
  const anime = res.data
  let animeData = await getAnimeData(user, anime, animeId)
  bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
  ctx.answerCbQuery(``)
})

bot.action(/^status-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let statusKeyboard = { 'inline_keyboard': [
    [{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: 'Просмотрено', callback_data: `status-0`, hide: false }, { text: 'Смотрю', callback_data: `status-1`, hide: false }], 
    [{ text: 'Пересматриваю', callback_data: `status-2`, hide: false }, { text: 'Запланировано', callback_data: `status-3`, hide: false }, { text: 'Отложено', callback_data: `status-4`, hide: false }],
    [{ text: 'Брошено', callback_data: `status-5`, hide: false }, { text: '🗑 Удалить из списка', callback_data: `status-6`, hide: false }]
  ]}
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if(user != undefined) {
    if(selected != 20 && selected != 6) {
      let status = ''
      if(selected == 0) status = 'completed'
      if(selected == 1) status = 'watching'
      if(selected == 2) status = 'rewatching'
      if(selected == 3) status = 'planned'
      if(selected == 4) status = 'on_hold'
      if(selected == 5) status = 'dropped'
      axios.post(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: {user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', status: status} }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
      .then(async res => {
        const animeRes = await axios.get(`https://shikimori.one/api/animes/${animeId}`)
        const anime = animeRes.data
        let animeData = await getAnimeData(user, anime, animeId)
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
      })
      .catch(er => {
        console.log(er)
      })
    } else {
      const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
      let needKeyboard = true
      if(list[0] != undefined) {
        let nowStatus = list[0].status
        if(nowStatus == 'completed') statusKeyboard.inline_keyboard[0][1].text = '✅ Просмотрено'
        if(nowStatus == 'watching') statusKeyboard.inline_keyboard[0][2].text = '✅ Смотрю'
        if(nowStatus == 'rewatching') statusKeyboard.inline_keyboard[1][0].text = '✅ Пересматриваю'
        if(nowStatus == 'planned') statusKeyboard.inline_keyboard[1][1].text = '✅ Запланировано'
        if(nowStatus == 'on_hold') statusKeyboard.inline_keyboard[1][2].text = '✅ Отложено'
        if(nowStatus == 'dropped') statusKeyboard.inline_keyboard[2][0].text = '✅ Брошено'
        if(selected == 6) {
          needKeyboard = false
          axios.delete(`https://shikimori.one/api/v2/user_rates/${list[0].id}`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
          .then(async res => {
            const animeRes = await axios.get(`https://shikimori.one/api/animes/${animeId}`)
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
      
      if(needKeyboard) bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(statusKeyboard))
    }
  }
  ctx.answerCbQuery(``)
})

bot.action(/^star-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selected = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let starKeyboard = { 'inline_keyboard': [[{ text: '◀️ Назад', callback_data: 'about', hide: false }, { text: '0 ⭐', callback_data: `star-0`, hide: false }, { text: '1 ⭐', callback_data: `star-1`, hide: false }, { text: '2 ⭐', callback_data: `star-2`, hide: false }],
    [{ text: '3 ⭐', callback_data: `star-3`, hide: false }, { text: '4 ⭐', callback_data: `star-4`, hide: false }, { text: '5 ⭐', callback_data: `star-5`, hide: false }, { text: '6 ⭐', callback_data: `star-6`, hide: false }, { text: '7 ⭐', callback_data: `star-7`, hide: false }],
    [{ text: '8 ⭐', callback_data: `star-8`, hide: false }, { text: '9 ⭐', callback_data: `star-9`, hide: false }, { text: '10 ⭐', callback_data: `star-10`, hide: false }]
  ]}
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if(user != undefined) {
    if(selected != 20) {
      axios.post(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: {user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', score: parseInt(selected)} }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
      .then(async res => {
        const animeRes = await axios.get(`https://shikimori.one/api/animes/${animeId}`)
        const anime = animeRes.data
        let animeData = await getAnimeData(user, anime, animeId)
        bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, animeData.msg, { parse_mode: 'HTML', reply_markup: JSON.stringify(animeData.keyboard) })
      })
      .catch(er => {
        console.log(er)
      })
    } else {
      const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
      if(list[0] != undefined) {
        let star = list[0].score
        if(star == 0) starKeyboard.inline_keyboard[0][1].text = '✅ 0 ⭐'
        if(star == 1) starKeyboard.inline_keyboard[0][2].text = '✅ 1 ⭐'
        if(star == 2) starKeyboard.inline_keyboard[0][3].text = '✅ 2 ⭐'
        if(star == 3) starKeyboard.inline_keyboard[1][0].text = '✅ 3 ⭐'
        if(star == 4) starKeyboard.inline_keyboard[1][1].text = '✅ 4 ⭐'
        if(star == 5) starKeyboard.inline_keyboard[1][2].text = '✅ 5 ⭐'
        if(star == 6) starKeyboard.inline_keyboard[1][3].text = '✅ 6 ⭐'
        if(star == 7) starKeyboard.inline_keyboard[1][4].text = '✅ 7 ⭐'
        if(star == 8) starKeyboard.inline_keyboard[2][0].text = '✅ 8 ⭐'
        if(star == 9) starKeyboard.inline_keyboard[2][1].text = '✅ 9 ⭐'
        if(star == 10) starKeyboard.inline_keyboard[2][2].text = '✅ 10 ⭐'
      }
      bot.telegram.editMessageReplyMarkup(msg.message.chat.id, msg.message.message_id, msg.message.message_id, JSON.stringify(starKeyboard))
    }
  }
  ctx.answerCbQuery(``)
})

async function getAnimeData(user, anime, animeId, random) {
  let nowEpisode = 1
  let animeKeyboard = { 'inline_keyboard': [[{ text: '📺 Список серий', callback_data: `list_dub-${nowEpisode}`, hide: false }]] }
  if(user != undefined) {
    const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${anime.id}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    if(list.length > 0) {
      nowEpisode = list[0].episodes
      animeKeyboard.inline_keyboard[0][0].callback_data = `list_dub-${nowEpisode}`
      animeKeyboard.inline_keyboard[0].push({ text: `⭐ Изменить оценку (${list[0].score})`, callback_data: `star-20`, hide: false })
      animeKeyboard.inline_keyboard.push([{ text: `🔹 Изменить статус (${statusToRus(list[0].status)})`, callback_data: `status-20`, hide: false }])
    } else {
      animeKeyboard.inline_keyboard[0].push({ text: `⭐ Поставить оценку`, callback_data: `star-20`, hide: false })
      animeKeyboard.inline_keyboard.push([{ text: `🔹 Поставить статус`, callback_data: `status-20`, hide: false }])
    }
  }
  if(random) animeKeyboard.inline_keyboard.push([{ text: `🔄 Рерол`, callback_data: `random`, hide: false }])
  return {
    msg: `<a href="https://shikimori.one/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
Жанры: ${anime.genres.map(genre => genre.russian).join(', ')}
Рейтинг: ${anime.rating.toUpperCase()}
ID: ${anime.id}
Тип: ${anime.kind.toUpperCase()}<a href="${`https://shikimori.one${anime.image.original}`}">\n</a>${anime.description ? anime.description.replace(/([\[]*)\[(.*?)\]/gm, '') : ''}
    `,
    keyboard: animeKeyboard
  }
}

bot.on('inline_query', async (ctx) => {
  try {
    let query = ctx.update.inline_query.query
    let search = `https://shikimori.one/api/animes/?limit=50&search=${encodeURI(query)}&order=ranked `
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

bot.action(/^profile-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selectedUser = ctx.match[1]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    const { data: profile } = await axios.get(`https://shikimori.one/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${profile.id}&limit=1000&status=watching`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    const { data: animeList } = await axios.get(`https://shikimori.one/api/animes?ids=${list.map(id => id.target_id).join(',')}&limit=50`)
    let nowText = `\n<b>Сейчас смотрит:</b> `
    list.slice(0, 5).forEach(async (a, ind) => {
      let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
      if(animeData) nowText += `\n<a href="https://shikimori.one/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
    })
    let animeKeyboard = {'inline_keyboard': [
      [{ text: '✅ Профиль', callback_data: `profile-${selectedUser}`, hide: false }, { text: 'Список просмотренного', callback_data: `profile_completed-${selectedUser}`, hide: false }],
    ]}

    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<a href="${profile.url}"><b>${profile.nickname}</b></a><a href="${profile.image.x160}">\n</a>Последняя активность: ${new Date(profile.last_online_at).toLocaleDateString()}\nВозраст: ${profile.full_years}\n${nowText}`
    , { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard), disable_web_page_preview: false})
  } else {
    ctx.reply(`Для авторизации введите команду /auth`)
  }
  ctx.answerCbQuery(``)
})

bot.action(/^profile_completed-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let selectedUser = ctx.match[1]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if (user != undefined) {
    const { data: profile } = await axios.get(`https://shikimori.one/api/users/${user.nickname}?is_nickname=1`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    let { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${profile.id}&limit=1000&status=completed`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    list = list.sort((a, b) => b.score - a.score).slice(0, 50)
    const { data: animeList } = await axios.get(`https://shikimori.one/api/animes?ids=${list.map(id => id.target_id).join(',')}&limit=50`)
    let nowText = `<b>Список просмотренного:</b> `
    list.sort((a, b) => b.score - a.score).slice(0, 50).forEach(async (a, ind) => {
      let animeData = animeList.find(b => { if (b.id == a.target_id) return true })
      if(animeData) nowText += `\n<a href="https://shikimori.one/animes/${a.target_id}">${animeData ? animeData.name : 'Нет названия'}</a> - ${a.score} ⭐️ [${a.episodes}/${animeData ? animeData.episodes : ''}]`
    })
    let animeKeyboard = {'inline_keyboard': [
      [{ text: 'Профиль', callback_data: `profile-${selectedUser}`, hide: false }, { text: '✅ Список просмотренного', callback_data: `profile_completed-${selectedUser}`, hide: false }],
    ]}

    bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `${nowText}`
    , { parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard), disable_web_page_preview: true})
  } else {
    ctx.reply(`Для авторизации введите команду /auth`)
  }
  ctx.answerCbQuery(``)
})

bot.action(/^watch-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let epidose = ctx.match[1]
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
  if(user != undefined) {
    axios.post(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { user_rate: {user_id: user.shikimori_id, target_id: animeId, target_type: 'Anime', episodes: parseInt(epidose), status: 'watching'} }, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    .then(async postRes => {
      let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
      let episode = +ctx.match[0].split('-')[1]
      let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
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
      if(user != undefined) {
        const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
        if(list.length > 0) {
          animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
        } else {
          animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
        }
      }
      bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
      ctx.answerCbQuery(``)
    })
    .catch(er => {
      console.log(er)
    })
  }
})

bot.action(/^list_dub-(\d+)$/, async (ctx) => {
  let msg = ctx.update.callback_query
  let animeId = msg.message.text.split('ID: ')[1].split('\n')[0]
  let name = msg.message.text.split('\n')[0]
  let maxEpidose = msg.message.text.split('Эпизоды: ')[1].split('\n')[0]
  let episode = +ctx.match[0].split('-')[1]
  let user = db.get('profiles').value().find(a => { if (msg.from.id == a.telegram_id) return true })
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
  if(user != undefined) {
    const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${animeId}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` }  })
    if(list.length > 0 && list[0].episodes >= episode) {
      animeKeyboard.inline_keyboard.push([{ text: `✅ Снять просмотр`, callback_data: `watch-${episode}`, hide: false }])
    } else {
      animeKeyboard.inline_keyboard.push([{ text: `⛔️ Отметить серию`, callback_data: `watch-${episode}`, hide: false }])
    }
  }
  bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
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
  bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
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
  bot.telegram.editMessageText(msg.message.chat.id, msg.message.message_id, msg.message.message_id, `<b>${name}</b>\n${episode} серия\nID: ${animeId}\nЭпизоды: ${maxEpidose}\n${episodeText}`, {disable_web_page_preview: true, parse_mode: 'HTML', reply_markup: JSON.stringify(animeKeyboard)})
  ctx.answerCbQuery(``)
})

function statusToRus(status) {
  if(status == 'completed') return 'Просмотрено'
  if(status == 'dropped') return 'Брошено'
  if(status == 'on_hold') return 'Отложено'
  if(status == 'planned') return 'Запланировано'
  if(status == 'rewatching') return 'Пересматриваю'
  if(status == 'watching') return 'Смотрю'
}

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

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

bot.on('chosen_inline_result', ({ chosenInlineResult }) => {
  console.log('chosen inline result', chosenInlineResult)
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
