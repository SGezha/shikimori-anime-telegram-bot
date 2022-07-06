const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
const Shikimori = require("node-shikimori-api")
const shiki = new Shikimori()
require('dotenv').config()

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.command('oldschool', (ctx) => ctx.reply('Hello'))
bot.command('hipster', Telegraf.reply('λ'))
bot.launch()


bot.command('anime', async (ctx) => {
  console.log(ctx.message)
  await axios.get(`https://shikimori.one/api/animes/${ctx.message.text.split(' ')[1]}`)
    .then(async anime => {
      const animeData = anime.data
      console.log(animeData)
    })
  ctx.reply(`
    test
  `, { parse_mode: 'MarkdownV2', reply_markup: JSON.stringify({ 'inline_keyboard': [[{ text: 'Test', callback_data: 'test', hide: false }]] })})
})


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
          message_text: `/anime ${i.id}`
        },
      })
    })

    console.log(Markup.inlineKeyboard([
      Markup.button.callback('Test', 'test')
    ]).reply_markup.inline_keyboard)


    return ctx.answerInlineQuery(result)
  } catch (er) {
    console.log(er)
  }
})


bot.on('chosen_inline_result', ({ chosenInlineResult }) => {
  console.log('chosen inline result', chosenInlineResult)
})

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
