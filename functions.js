const axios = require('axios')

const getGenre = (id) => {
    let genres = [{ "name": "Сёнен", "id": "27" }, { "name": "Сёнен-ай", "id": "28" }, { "name": "Сэйнэн", "id": "42" }, { "name": "Сёдзё", "id": "25" }, { "name": "Сёдзё-ай", "id": "26" }, { "name": "Дзёсей", "id": "43" }, { "name": "Комедия", "id": "4" }, { "name": "Романтика", "id": "22" }, { "name": "Школа", "id": "23" }, { "name": "Безумие", "id": "5" }, { "name": "Боевые искусства", "id": "17" }, { "name": "Вампиры", "id": "32" }, { "name": "Военное", "id": "38" }, { "name": "Гарем", "id": "35" }, { "name": "Гурман", "id": "543" }, { "name": "Демоны", "id": "6" }, { "name": "Детектив", "id": "7" }, { "name": "Детское", "id": "15" }, { "name": "Драма", "id": "8" }, { "name": "Игры", "id": "11" }, { "name": "Исторический", "id": "13" }, { "name": "Космос", "id": "29" }, { "name": "Магия", "id": "16" }, { "name": "Машины", "id": "3" }, { "name": "Меха", "id": "18" }, { "name": "Музыка", "id": "19" }, { "name": "Пародия", "id": "20" }, { "name": "Повседневность", "id": "36" }, { "name": "Полиция", "id": "39" }, { "name": "Приключения", "id": "2" }, { "name": "Психологическое", "id": "40" }, { "name": "Работа", "id": "541" }, { "name": "Самураи", "id": "21" }, { "name": "Сверхъестественное", "id": "37" }, { "name": "Спорт", "id": "30" }, { "name": "Супер сила", "id": "31" }, { "name": "Ужасы", "id": "14" }, { "name": "Фантастика", "id": "24" }, { "name": "Фэнтези", "id": "10" }, { "name": "Экшен", "id": "1" }, { "name": "Этти", "id": "9" }, { "name": "Триллер", "id": "41" }, { "name": "Эротика", "id": "539" }, { "name": "Хентай", "id": "12" }, { "name": "Яой", "id": "33" }, { "name": "Юри", "id": "34" }]
    return genres.find(a => { if (a.id == id) return true }).name
}

const statusToRus = (status) => {
    if (status == 'completed') return 'Просмотрено'
    if (status == 'dropped') return 'Брошено'
    if (status == 'on_hold') return 'Отложено'
    if (status == 'planned') return 'Запланировано'
    if (status == 'rewatching') return 'Пересматриваю'
    if (status == 'watching') return 'Смотрю'
}

const getEpisode = (data, kodik, episode, type) => {
    kodik.results.forEach(a => {
        let kind = 'озвучка'
        let videoUrl = a.link
        if (a.seasons) videoUrl = a.seasons[a.last_season].episodes[`${episode}`]
        if (a.translation.type == 'subtitles') kind = 'субтитры'
        if (videoUrl) data.push({
            id: a.id,
            url: `https://animebot.smotrel.net/kodik?video=${videoUrl}&title=${a.title_orig}`,
            anime_id: a.shikimori_id,
            anime_english: a.title_orig,
            anime_russian: a.title,
            episode: episode,
            kind: kind,
            quality: a.quality,
            author: a.translation.title,
            watches_count: null
        })
    })
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
        if (a.kind == 'озвучка') episodesArray[0].data.push(a)
        if (a.kind == 'субтитры') episodesArray[1].data.push(a)
        if (a.kind == 'оригинал') episodesArray[2].data.push(a)
    })
    let episodeText = ''
    episodesArray[type].data.sort((a, b) => b.watches_count - a.watches_count).filter(a => !a.url.includes('smotret-anime.online')).slice(0, 30).forEach((a, ind) => {
        if (ind == 0) episodeText += `\n`
        let type = a.url
        if (a.url.includes('https')) { type = `${type.split('https://')[1].split('/')[0]}` }
        else { type = `${type.split('http://')[1].split('/')[0]}` }
        if (a.url.includes('animebot')) type = 'aniqit.com'

        episodeText += `${a.author} ${a.quality != 'unknown' ? a.quality : ''} - <a href="${a.url}">${type}</a> ${a.watches_count ? '[📺 ' + a.watches_count + ']' : ''}`
        if (ind != episodesArray[0].data.length - 1) episodeText += '\n'
    })
    return episodeText
}

const msToTime = (start, finish) => {
    let duration = finish - start

    let seconds = parseInt((duration / 1000) % 60)
    let minutes = parseInt((duration / (1000 * 60)) % 60)
    let hours = parseInt((duration / (1000 * 60 * 60)) % 24)
    hours = (hours < 10) ? "0" + hours : hours
    minutes = (minutes < 10) ? "0" + minutes : minutes
    seconds = (seconds < 10) ? "0" + seconds : seconds
    return hours + ":" + minutes + ":" + seconds
}

const toHHMMSS = (time) => {
    var sec_num = parseInt(time, 10) // don't forget the second param
    var hours = Math.floor(sec_num / 3600)
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60)
    var seconds = sec_num - (hours * 3600) - (minutes * 60)

    if (hours < 10) { hours = "0" + hours }
    if (minutes < 10) { minutes = "0" + minutes }
    if (seconds < 10) { seconds = "0" + seconds }
    return hours + ':' + minutes + ':' + seconds
}

const getRandomInt = (min, max) => {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min
}

const getShikiImage = async (anime) => {
    let page = fs.readFileSync('./html/shiki-page.html', 'utf8').toString()
    page = page.replace('{{ style }}', `<style>${fs.readFileSync('./html/css/shiki.css', 'utf8').toString()}</style>`)
    page = page.replace('{{ Name }}', anime.russian)
    page = page.replace('{{ Name_en }}', anime.name)
    page = page.replace('{{ Name_en }}', anime.name)
    page = page.replace('{{ Poster_img }}', `https://shikimori.one${anime.image.preview}`)
    page = page.replace('{{ Stars }}', anime.score)
    page = page.replace('{{ Rating }}', anime.rating)
    page = page.replace('{{ Kind }}', anime.kind)
    page = page.replace('{{ Duration }}', anime.duration)
    page = page.replace('{{ Episodes }}', anime.episodes)
    page = page.replace('{{ Episodes_aired }}', anime.episodes_aired)

    let allStatus = anime.rates_statuses_stats.reduce((partialSum, a) => partialSum + a.value, 0)
    anime.rates_statuses_stats.forEach(s => {
        page = page.replace(`{{ ${s.name}_число }}`, s.value)
        page = page.replace(`{{ ${s.name}_процент }}`, isWhatPercentOf(s.value, allStatus))
    })

    let allScores = anime.rates_scores_stats.reduce((partialSum, a) => partialSum + a.value, 0)
    anime.rates_scores_stats.forEach(s => {
        page = page.replace(`{{ ${s.name}_число }}`, s.value)
        page = page.replace(`{{ ${s.name}_процент }}`, isWhatPercentOf(s.value, allScores))
    })

    page = page.replace('{{ Studia }}', `https://shikimori.one${anime.studios[0].image}`)
    page = page.replace('{{ Genres }}', anime.genres.map(genre => `<div class="value">${genre.russian}</div>`).join(', '))
    fs.writeFileSync('test.html', page)
    return page
}

const isWhatPercentOf = (numA, numB) => {
    return (numA / numB) * 100;
}

const getRandomSettings = (text, change, changeValue) => {
    let settings = {
        star: undefined,
        kind: undefined,
        genres: [],
        status: undefined,
        query: '',
        msg: '',
    }
    if (text.includes('оценка-') && change != 'star') {
        settings.star = text.split('оценка-')[1].split(' ')[0]
    }
    if (text.includes('тип-') && change != 'kind') {
        settings.kind = text.split('тип-')[1].split(' ')[0]
    }
    if (text.includes('статус-') && change != 'status') {
        settings.status = text.split('статус-')[1].split(' ')[0]
    }
    if (text.includes('жанры-')) {
        settings.genres = text.split('жанры-')[1].split(' ')[0].split(',')
    }
    if (change && change != 'genres') settings[change] = changeValue
    if (change == 'genres' && settings.genres.find(a => a == changeValue) == undefined) settings.genres.push(changeValue)
    if (settings.star || settings.kind || settings.status || settings.genres.length > 0) settings.msg = '<b>Настройки рандома: </b>'
    if (settings.star) {
        settings.msg += `оценка-${settings.star} `
        settings.query += `&score=${settings.star}`
    }
    if (settings.kind) {
        settings.msg += `тип-${settings.kind} `
        settings.query += `&kind=${settings.kind}`
    }
    if (settings.status) {
        settings.msg += `статус-${settings.status} `
        settings.query += `&status=${settings.status}`
    }
    if (settings.genres.find(a => a == 0) != undefined) settings.genres = []
    if (settings.genres.length > 0) {
        settings.msg += `жанры-${settings.genres.toString()} `
        settings.query += `&genre=${settings.genres.toString()}`
    }
    return settings
}

const getAnimeData = async(user, anime, animeId, random, message) => {
    let nowEpisode = 1
    let animeKeyboard = { 'inline_keyboard': [[{ text: '📺 Список серий', callback_data: `list_dub-${nowEpisode}`, hide: false }]] }
    if (user != undefined && !random) {
        user = await getNewToken(user)
        const { data: list } = await axios.get(`https://shikimori.one/api/v2/user_rates?user_id=${user.shikimori_id}&limit=1000&target_id=${anime.id}&target_type=Anime`, { headers: { 'User-Agent': 'anime4funbot - Telegram', 'Authorization': `Bearer ${user.token}` } })
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
        msg: `<a href="https://shikimori.one/animes/${anime.id}"><b>${anime.name}</b> ${anime.russian ? '(' + anime.russian + ')' : ''}</a>
Звезды: <b>${anime.score}</b> ⭐
Эпизоды: ${anime.episodes}
Жанры: ${anime.genres?.map(genre => genre.russian).join(', ')}
Рейтинг: ${anime.rating?.toUpperCase()}
ID: ${anime.id}
Тип: ${anime.kind.toUpperCase()}<a href="${`https://shikimori.one${anime.image.original}`}">\n</a>${anime.description ? (anime.description.replace(/([\[]*)\[(.*?)\]/gm, '').length > 299) ? anime.description.replace(/([\[]*)\[(.*?)\]/gm, '').slice(0, 300) + '...' : anime.description.replace(/([\[]*)\[(.*?)\]/gm, '') : ''}${user != undefined ? '\nСейчас тыкает: <b>' + user.nickname + '</b>' : ''}`,
        keyboard: animeKeyboard
    }
}

module.exports = {
    getGenre,
    statusToRus,
    getEpisode,
    msToTime,
    toHHMMSS,
    getRandomInt,
    isWhatPercentOf,
    getShikiImage,
    getRandomSettings,
    getAnimeData
}