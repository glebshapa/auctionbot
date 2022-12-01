import config from './config.js';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(config.bot.token);
const callbackButton = Markup.button.callback;
const urlButton = Markup.button.url;

import { User, Lot } from './models.js';

const mainKB = Markup.keyboard([
    ['🥇 Мои аукционы'],
    ['ℹ️ Правила'],
    ['❓ Помощь'],
]).resize();

const adminKB = Markup.keyboard([
    ['➕ Создать лот'],
    ['🟩 Разбанить пользователя', '🟥 Забанить пользователя'],
    ['❌ Снять последнюю ставку у лота'],
    ['🗑 Удалить лот'],
    ['◀️ Выйти из админки']
]).resize();

// const shareLot = id => ;

const cancelKB = Markup.keyboard([
    ['◀️ Отмена']
]).resize();

const lotKB = (lotId) => Markup.inlineKeyboard([
    [callbackButton('+30₽', `lot_${lotId}_bet_30`), callbackButton('+50₽', `lot_${lotId}_bet_50`), callbackButton('+100₽', `lot_${lotId}_bet_100`)],
    [callbackButton('+300₽', `lot_${lotId}_bet_300`), callbackButton('+500₽', `lot_${lotId}_bet_500`) ],
    [callbackButton('🕔', `lot_${lotId}_time`), callbackButton('ℹ️', `lot_${lotId}_info`)]
]);

bot.use(async (ctx, next) => {
    try {
        let msg = ctx.message, data;
        if (!msg && ctx.callbackQuery) {
            msg = ctx.callbackQuery.message;
            data = ctx.callbackQuery.data;
        }
        if (!msg || !msg.chat || msg.chat.type != 'private') {
            if (data) {
                let lot = await Lot.findOne({id: Number(data.split('_')[1])});

                if (lot.status == 'completed') {
                    return await ctx.answerCbQuery('Лот завершён!');
                }
    
                if (lot.status == 'wait') {
                    return await ctx.answerCbQuery('Лота не существует!');
                }

                if (data.split('_')[2] == 'time') {
                    let secs = Math.floor((lot.endDate - Date.now()) / 1000);
                    let hours = Math.floor(secs / (60 * 60));
                    let mins = Math.floor( (secs % 3600) / 60);
                    secs = secs % 60;
                    await ctx.answerCbQuery(`Осталось ${hours}ч. ${mins}м. ${secs}с.`);
                } else if (data.split('_')[2] == 'info') {
                    await ctx.answerCbQuery('ℹ️ Чтобы выкупить выигранный лот, необходимо написать продавцу в личные сообщения.\nℹ️ Выкуп осуществляется в течение 3 дней с момента окончания аукциона.\nℹ️ Невыкуп лота=блокировка в нашем сообществе.', {show_alert: true});
                }
            }
            return;
        }
        
        let u = await User.findOne({id: msg.chat.id});
        if (!u) {
            u = new User({
                id: msg.chat.id,
                ban: false,
                state: 'main',
                auctions: [],
                cntWonAuctions: 0,
                cntBets: 0
            });
            await u.save();
        }
        
        if (u.ban) {
            return await ctx.replyWithHTML(`Вы забанены!`);
        }

        ctx.u = u;
        return next();
    }
    catch {
        console.log('Ошибка в bot.use');
        console.log(e);
        return await ctx.replyWithHTML(`Что-то пошло не так... Пропишите /start`);
    }
})

bot.on(`photo`, async (ctx) => {
    try {
        let uid = ctx.message.chat.id,
            photo = ctx.message.photo,
            answer = async (text, keyboard) => ctx.replyWithHTML(text, keyboard),
            u = ctx.u;
        

        if (u.state.startsWith('admin')) {

            let parts = u.state.split('_');
    
            if (parts[1] == 'photo') {
                
                let lotId = Number(parts[2]), disc = parts[3], seller = parts[4], start = Number(parts[5]), startDate = Number(parts[6]) - 3 * 60 * 60 * 1000, endDate = Number(parts[7]) - 3 * 60 * 60 * 1000;
                console.log({
                    id: lotId,
                    status: 'wait',
                    text: disc,
                    seller,
                    top: [],
                    start,
                    startDate,
                    endDate,
                    photoId: photo[0].file_id,
                    msgId: null
                });
                await Lot.create({
                    id: lotId,
                    status: 'wait',
                    text: disc,
                    seller,
                    top: [],
                    start,
                    startDate,
                    endDate,
                    photoId: photo[0].file_id,
                    msgId: null
                });
                await u.updateOne({state: `admin`});
                return await answer(`Лот успешно создан!`, adminKB);
            }

    
        }


    }
    catch (e) {
        console.log('Ошибка в bot.on("photo")');
        console.log(e);
        return await ctx.replyWithHTML(`Что-то пошло не так... Пропишите /start`);
    }
});

bot.on(`text`, async (ctx) => {
    try {
        let uid = ctx.message.chat.id,
            text = ctx.message.text,
            answer = async (text, keyboard) => ctx.replyWithHTML(text, keyboard),
            answerWithPhoto = async (photo, caption, keyboard) => ctx.replyWithPhoto(photo, { caption, ...keyboard }),
            u = ctx.u;

            
        console.log(`${uid} отправил текст: ${text}`);

        if (text == '/start') {
            await u.updateOne({state: 'main'});
            return await answer(`Главное меню!`, mainKB);
        }

        if (text == '/admin' && config.admins.includes(uid)) {
            await u.updateOne({state: 'admin'});
            return await answer(`Приветствуем в админке!`, adminKB);
        }

        if (u.state.startsWith('admin')) {

            let parts = u.state.split('_');
            
            if (text == '◀️ Отмена') {
                await u.updateOne({state: 'admin'});
                return await answer(`Вы в админке!`, adminKB);
            }
    
            if (parts[1] == 'unban') {
                await u.updateOne({state: 'admin'});
                if (!Number.isInteger(Number(text)))
                    return await answer(`Произошла ошибка!`, adminKB); 
                let su = await User.findOne({id: Number(text)});
                if (su) {
                    await su.updateOne({ban: false});
                    return await answer(`Пользователь успешно разбанен!`, adminKB);
                } else
                    return await answer(`Произошла ошибка!`, adminKB);       
            }

            if (parts[1] == 'ban') {
                await u.updateOne({state: 'admin'});
                if (!Number.isInteger(Number(text)))
                    return await answer(`Произошла ошибка!`, adminKB); 
                let su = await User.findOne({id: Number(text)});
                if (su) {
                    await su.updateOne({ban: true});
                    return await answer(`Пользователь успешно забанен!`, adminKB);
                } else
                    return await answer(`Произошла ошибка!`, adminKB);  
            }

            if (parts[1] == 'deleteBet') {
                await u.updateOne({state: 'admin'});
                if (!Number.isInteger(Number(text)))
                    return await answer(`Произошла ошибка!`, adminKB); 
                let slot = await Lot.findOne({id: Number(text)});
                if (slot && slot.top.length > 0) {
                    let newTop = slot.top;
                    newTop.shift();
                    await slot.updateOne({top: newTop});
                    return await answer(`Ставка успешно убрана!`, adminKB);
                } else
                    return await answer(`Произошла ошибка!`, adminKB);  
            }
            
            if (parts[1] == 'deleteLot') {
                await u.updateOne({state: 'admin'});
                if (!Number.isInteger(Number(text)))
                    return await answer(`Произошла ошибка!`, adminKB); 
                let slot = await Lot.findOne({id: Number(text)});
                if (slot) {
                    await slot.deleteOne({});
                    return await answer(`Лот успешно удалён!`, adminKB);
                } else
                    return await answer(`Произошла ошибка!`, adminKB);  
            }

            if (parts[1] == 'lotId') {

                let lotId = Number(text);
                if (Number.isInteger(lotId)) {
                    let uniqueLotCheck = await Lot.findOne({id: lotId});
                    if (!uniqueLotCheck) {
                        await u.updateOne({state: `admin_text_${lotId}`});
                        return answer(`Введите текст лота!`, cancelKB);
                    } else return answer(`Такой id уже существует! Введите id лота!`, cancelKB);
                } else return answer(`Введите id лота!`, cancelKB);

            } else if (parts[1] == 'text') {

                await u.updateOne({state: `admin_seller_${parts[2]}_${text}`});
                return answer(`Введите продавца лота!`, cancelKB);

            } else if (parts[1] == 'seller') {

                await u.updateOne({state: `admin_start_${parts[2]}_${parts[3]}_${text}`});
                return answer(`Введите стартовую цену лота!`, cancelKB);

            } else if (parts[1] == 'start') {

                let start = Number(text);
                if (Number.isInteger(start)) {
                    await u.updateOne({state: `admin_startDate_${parts[2]}_${parts[3]}_${parts[4]}_${start}`});
                    return answer(`Введите дату начала лота!`, cancelKB);
                } else return answer(`Введите стартовую цену лота!`, cancelKB);

            } else if (parts[1] == 'startDate') {
                let startDate;
                try { startDate = Number(Date.UTC(text.split(' ')[0].split('.')[2], text.split(' ')[0].split('.')[1] - 1, text.split(' ')[0].split('.')[0], text.split(' ')[1].split(':')[0], text.split(' ')[1].split(':')[1], text.split(' ')[1].split(':')[2])); }
                catch { return answer(`Введите дату начала лота!`, cancelKB); }
                
                if (Number.isInteger(startDate)) {
                    await u.updateOne({state: `admin_endDate_${parts[2]}_${parts[3]}_${parts[4]}_${parts[5]}_${startDate}`});
                    return answer(`Введите дату окончания лота!`, cancelKB);
                } else return answer(`Введите дату начала лота!`, cancelKB);
                
            } else if (parts[1] == 'endDate') {
                
                let endDate;
                try { endDate = Number(Date.UTC(text.split(' ')[0].split('.')[2], text.split(' ')[0].split('.')[1] - 1, text.split(' ')[0].split('.')[0], text.split(' ')[1].split(':')[0], text.split(' ')[1].split(':')[1], text.split(' ')[1].split(':')[2])); }
                catch { return answer(`Введите дату окончания лота!`, cancelKB); }

                if (Number.isInteger(endDate)) {
                    await u.updateOne({state: `admin_photo_${parts[2]}_${parts[3]}_${parts[4]}_${parts[5]}_${parts[6]}_${endDate}`});
                    return answer(`Отправьте фото лота!`, cancelKB);
                } else return answer(`Введите дату окончания лота!`, cancelKB);
                
            } else if (parts[1] == 'photo') return answer(`Отправьте фото лота!`, cancelKB);
    
            if (text == '➕ Создать лот') {
                await u.updateOne({state: 'admin_lotId'});
                return answer(`Введите id лота!`, cancelKB);
            }

            if (text == '🟩 Разбанить пользователя') {
                await u.updateOne({state: 'admin_unban'});
                return answer(`Введите id пользователья, которого хотите разбанить!`, cancelKB);
            }

            if (text == '🟥 Забанить пользователя') {
                await u.updateOne({state: 'admin_ban'});
                return answer(`Введите id пользователья, которого хотите забанить!`, cancelKB);
            }

            if (text == '❌ Снять последнюю ставку у лота') {
                await u.updateOne({state: 'admin_deleteBet'});
                return answer(`Введите id лота, у которого хотите удалить последнюю ставку!`, cancelKB);
            }
            
            if (text == '🗑 Удалить лот') {
                await u.updateOne({state: 'admin_deleteLot'});
                return answer(`Введите id лота, который хотите удалить!`, cancelKB);
            }

            if (text == '◀️ Выйти из админки') {
                await u.updateOne({state: 'main'});
                return answer(`Главное меню!`, mainKB);
            }
    
        }

        //

        if (text.split(' ')[0] == '/start' && Number.isInteger(Number(text.split(' ')[1]))) {
            let lot = await Lot.findOne({id: Number(text.split(' ')[1])});

            if (lot) {
                if (lot.status == 'completed')
                    return answer('Ошибка! Лот завершён!');

                if (lot.status == 'wait')
                    return answer('Ошибка! Лота не существует!');

                let KB = lotKB(lot.id);
                if (lot.top.length == 0)
                    KB.reply_markup.inline_keyboard.unshift([callbackButton('Старт', `lot_${lot.id}_bet_start`)]);

                return answerWithPhoto(lot.photoId, `${lot.text}
Продавец: ${lot.seller}
${ lot.top.length == 0 ? `↘️ Старт: ${lot.start} рублей` : `1 место: ${ lot.top.length > 0 ? (lot.top[0].user.username ? lot.top[0].user.username.slice(0, 4) : String(lot.top[0].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[0].bet + '₽' : '-----' }
2 место: ${ lot.top.length > 1 ? (lot.top[1].user.username ? lot.top[1].user.username.slice(0, 4) : String(lot.top[1].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[1].bet + '₽' : '-----' }
3 место: ${ lot.top.length > 2 ? (lot.top[2].user.username ? lot.top[2].user.username.slice(0, 4) : String(lot.top[2].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[2].bet + '₽' : '-----' }`}`, KB);
            } else {
                return answer('Ошибка! Лота не существует!');
            }

        }

        if (Number.isInteger(Number(text.split('/')[1]))) {
            let lot = await Lot.findOne({id: Number(text.split('/')[1]) });
            console.log(lot);
            if (lot) {
                if (lot.status == 'completed')
                    return answer('Ошибка! Лот завершён!');

                if (lot.status == 'wait')
                    return answer('Ошибка! Лота не существует!');

                let KB = lotKB(lot.id);
                if (lot.top.length == 0)
                    KB.reply_markup.inline_keyboard.unshift([callbackButton('Старт', `lot_${lot.id}_bet_start`)]);
                
                return answerWithPhoto(lot.photoId, `${lot.text}
Продавец: ${lot.seller}
${ lot.top.length == 0 ? `↘️ Старт: ${lot.start} рублей` : `1 место: ${ lot.top.length > 0 ? (lot.top[0].user.username ? lot.top[0].user.username.slice(0, 4) : String(lot.top[0].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[0].bet + '₽' : '-----' }
2 место: ${ lot.top.length > 1 ? (lot.top[1].user.username ? lot.top[1].user.username.slice(0, 4) : String(lot.top[1].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[1].bet + '₽' : '-----' }
3 место: ${ lot.top.length > 2 ? (lot.top[2].user.username ? lot.top[2].user.username.slice(0, 4) : String(lot.top[2].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[2].bet + '₽' : '-----' }`}`, KB);
            } else {
                return answer('Ошибка! Лота не существует!');
            }
        }


        if (text == '🥇 Мои аукционы') {
            return answer(`Количество всех ставок: ${u.cntBets}
Количество всех аукционов: ${u.auctions.length}
Количество выигранных аукционов: ${u.cntWonAuctions}`, mainKB);
        }

        if (text == 'ℹ️ Правила') {
            return answer(`После окончания торгов,победитель должен выйти на связь с продавцом 
самостоятельно в течении суток‼️|\nПобедитель обязан выкупить лот в течении ТРЁХ дней,после окончания аукциона🔥
НЕ ВЫКУП ЛОТА - ПЕРМАНЕНТНЫЙ БАН ВО ВСЕХ НУМИЗМАТИЧЕСКИХ СООБЩЕСТВАХ И АУКЦИОНАХ🤬\nЧто бы узнать время окончания аукциона,нажмите на ⏰\nАнтиснайпер - Ставка сделанная за 10 минут до конца,автоматически переносит
Аукцион на 10 минут вперёд ‼️\n\nРаботают только проверенные продавцы,их Отзывы сумарно достигают 10000+ на различных площадках.\nДополнительные Фото можно запросить у продавца.\nСлучайно сделал ставку?🤔\nНапиши продавцу‼️


Отправка почтой,стоимость пересылки указана под фото.
Лоты можно копить ,экономя при этом на почте.
Отправка в течении трёх дней после оплаты‼️`, mainKB);
        }

        if (text == '❓ Помощь') {
            return answer(`Свяжитесь с нами, если у вас возникли вопросы @hollBmniM
Программист: @glebshapa`, mainKB);
        }
        
    }
    catch (e) {
        console.log('Ошибка в bot.on("text")');
        console.log(e);
        return await ctx.replyWithHTML(`Что-то пошло не так... Пропишите /start`);
    }
});

console.log(Date.now());

bot.on('callback_query', async (ctx) => {
    try {
        let uid = ctx.callbackQuery.message.chat.id,
            answer = async (text, keyboard) => ctx.editMessageText(text, { parse_mode, ...keyboard }),
            answerWithPhoto = async (text, keyboard) => ctx.editMessageCaption(text, { parse_mode, ...keyboard }),
            sendMessageWithPhoto = async (photo, caption, keyboard) => ctx.replyWithPhoto(photo, { caption, ...keyboard }),
            d = ctx.callbackQuery.data,
            u = ctx.u;
        
        console.log(`${uid} отправил колбэк: ${d}`);

        if (d.startsWith('lot')) {
            let lot = await Lot.findOne({id: Number(d.split('_')[1])});

            if (lot.status == 'completed') {
                await ctx.answerCbQuery('Ошибка! Лот завершён!');
                return await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            }

            if (lot.status == 'wait') {
                await ctx.answerCbQuery('Ошибка! Лота не существует!');
                return await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            }

            if (d.split('_')[2] == 'open') {
                return await sendMessageWithPhoto(lot.photoId,`${lot.text}
Продавец: ${lot.seller}
${ lot.top.length == 0 ? `↘️ Старт: ${lot.start} рублей` : `1 место: ${ lot.top.length > 0 ? (lot.top[0].user.username ? lot.top[0].user.username.slice(0, 4) : String(lot.top[0].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[0].bet + '₽' : '-----' }
2 место: ${ lot.top.length > 1 ? (lot.top[1].user.username ? lot.top[1].user.username.slice(0, 4) : String(lot.top[1].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[1].bet + '₽' : '-----' }
3 место: ${ lot.top.length > 2 ? (lot.top[2].user.username ? lot.top[2].user.username.slice(0, 4) : String(lot.top[2].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[2].bet + '₽' : '-----' }`}`, lotKB(lot.id));
            }

            

            let newTop = lot.top;
            if (d.split('_')[2] == 'bet') {

                let bet = Number(d.split('_')[3]);

                if (d.split('_')[3] == 'start') {
                    bet = 0;
                    if (newTop.length != 0) {
                        await ctx.answerCbQuery(`Ошибка! Лот уже начался!`);
                        return await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
                    }
                }

                let auctions = u.auctions;
                auctions.push(lot.id);
                await u.updateOne({cntBets: u.cntBets + 1, auctions: [...(new Set(auctions))] });
                
                if (newTop.length == 0)
                    newTop.push({user: ctx.callbackQuery.message.chat, bet: lot.start + bet});
                else
                    newTop.unshift({user: ctx.callbackQuery.message.chat, bet: newTop[0].bet + bet});
    
                await lot.updateOne({top: newTop});

                await bot.telegram.sendMessage(config.adminNotifications, `Аукцион <b>№${lot.id}</b>: Пользователь <a href="tg://user?id=${lot.top[0].user.id}">${lot.top[0].user.id}</a> сделал ставку в <b>${lot.top[0].bet}₽</b>`, {parse_mode});
                
                if ( (lot.endDate - Date.now()) < 10 * 60 * 1000) {
                    await lot.updateOne({endDate: Date.now() + 10 * 60 * 1000});
                }

                try {
                if (lot.top.length > 1)
                    await bot.telegram.sendMessage(lot.top[1].user.id, `Ваша ставка в лоте №${lot.id} перебита!`, {parse_mode, reply_markup: {inline_keyboard: [
                                [{text: '📖 Открыть лот', callback_data: `lot_${lot.id}_open`}],
                                    ]}});
                }
                catch (e) { console.log(e); }

                try {
                
                await bot.telegram.editMessageCaption(config.newsNotifications, lot.msgId, '', `${lot.text}
Продавец: ${lot.seller}
${ lot.top.length == 0 ? `↘️ Старт: ${lot.start} рублей` : `1 место: ${ lot.top.length > 0 ? (lot.top[0].user.username ? lot.top[0].user.username.slice(0, 4) : String(lot.top[0].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[0].bet + '₽' : '-----' }
2 место: ${ lot.top.length > 1 ? (lot.top[1].user.username ? lot.top[1].user.username.slice(0, 4) : String(lot.top[1].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[1].bet + '₽' : '-----' }
3 место: ${ lot.top.length > 2 ? (lot.top[2].user.username ? lot.top[2].user.username.slice(0, 4) : String(lot.top[2].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[2].bet + '₽' : '-----' }`}`, {parse_mode, reply_markup: {inline_keyboard: [
                                [{text: '📖 Открыть лот', url: `https://t.me/${config.bot.username}?start=${lot.id}`}],
                                [{text: '🕔', callback_data: `lot_${lot.id}_time`}, {text: 'ℹ️', callback_data: `lot_${lot.id}_info`}]
                               	]}});
                }
                catch (e) { console.log(e); }
            
            } else if (d.split('_')[2] == 'time') {
                let secs = Math.floor((lot.endDate - Date.now()) / 1000);
                let hours = Math.floor(secs / (60 * 60));
                let mins = Math.floor( (secs % 3600) / 60);
                secs = secs % 60;
                await ctx.answerCbQuery(`Осталось ${hours}ч. ${mins}м. ${secs}с.`);
            } else if (d.split('_')[2] == 'info') {
                await ctx.answerCbQuery('ℹ️ Чтобы выкупить выигранный лот, необходимо написать продавцу в личные сообщения.\nℹ️ Выкуп осуществляется в течение 3 дней с момента окончания аукциона.\nℹ️ Невыкуп лота=блокировка в нашем сообществе.', {show_alert: true});
            }

            let KB = lotKB(lot.id);
            if (lot.top.length == 0)
                KB.reply_markup.inline_keyboard.unshift([callbackButton('Старт', `lot_${lot.id}_bet_start`)]);


            try {
                return await answerWithPhoto(`${lot.text}
Продавец: ${lot.seller}
${ lot.top.length == 0 ? `↘️ Старт: ${lot.start} рублей` : `1 место: ${ lot.top.length > 0 ? (lot.top[0].user.username ? lot.top[0].user.username.slice(0, 4) : String(lot.top[0].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[0].bet + '₽' : '-----' }
2 место: ${ lot.top.length > 1 ? (lot.top[1].user.username ? lot.top[1].user.username.slice(0, 4) : String(lot.top[1].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[1].bet + '₽' : '-----' }
3 место: ${ lot.top.length > 2 ? (lot.top[2].user.username ? lot.top[2].user.username.slice(0, 4) : String(lot.top[2].user.id).slice(0, 4)) + '****' + ' - ' + lot.top[2].bet + '₽' : '-----' }`}`, KB);
            }
            catch (e) {
                return;
            }

        }
        

    }
    catch (e) {
        console.log('Ошибка в bot.on("callback_query")');
        console.log(e);
        return await ctx.replyWithHTML(`Что-то пошло не так... Пропишите /start`);
    }
});

bot.catch(e => console.log(e));

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('bot started');
const parse_mode = "html";

function word(words, number) {
    return words[(number % 100 > 4 && number % 100 < 20) ? 2 : [2, 0, 1, 1, 1, 2][(number % 10 < 5) ? number % 10 : 5]];
}

async function updateAll() {
    // console.log('updating...');
    
    let openedLots = await Lot.find({startDate: {$lt: Date.now()}, status: 'wait'});

    openedLots.map(async e => {
        await e.updateOne({status: 'open'});
        console.log(`${e.id} opened!`);

        let msgWithLot = await bot.telegram.sendPhoto(config.newsNotifications, e.photoId, {parse_mode, reply_markup: 
            {inline_keyboard: [
                [{text: '📖 Открыть лот', url: `https://t.me/${config.bot.username}?start=${e.id}`}],
                [{text: '🕔', callback_data: `lot_${e.id}_time`}, {text: 'ℹ️', callback_data: `lot_${e.id}_info`}]
            ]}, caption: `${e.text}
Продавец: ${e.seller}
${ e.top.length == 0 ? `↘️ Старт: ${e.start} рублей` : `1 место: ${ e.top.length > 0 ? (e.top[0].user.username ? e.top[0].user.username.slice(0, 4) : String(e.top[0].user.id).slice(0, 4)) + '****' + ' - ' + e.top[0].bet + '₽' : '-----' }
2 место: ${ e.top.length > 1 ? (e.top[1].user.username ? e.top[1].user.username.slice(0, 4) : String(e.top[1].user.id).slice(0, 4)) + '****' + ' - ' + e.top[1].bet + '₽' : '-----' }
3 место: ${ e.top.length > 2 ? (e.top[2].user.username ? e.top[2].user.username.slice(0, 4) : String(e.top[2].user.id).slice(0, 4)) + '****' + ' - ' + e.top[2].bet + '₽' : '-----' }`}`});
        await e.updateOne({msgId: msgWithLot.message_id});
        
        await bot.telegram.sendMessage(config.adminNotifications, `🏁 Аукцион <b>№${e.id}</b> начался`, {parse_mode});
    }); 
    
    let closedLots = await Lot.find({endDate: {$lt: Date.now()}, status: 'open'});
    
    closedLots.map(async e => {
        await e.updateOne({status: 'completed'});
        console.log(`${e.id} closed!`);
        
        if (e.top.length > 0) {
            await User.updateOne({id: e.top[0].user.id}, {$inc: {cntWonAuctions: 1}});
            await bot.telegram.sendMessage(e.top[0].user.id, `🏁 Аукцион <b>№${e.id}</b> закончился
Вы стали победителем со ставкой в <b>${e.top[0].bet}₽</b>
Свяжитесь с <b>${e.seller}</b> для получения лота`, {parse_mode});
        }

        await bot.telegram.sendMessage(config.adminNotifications, `🏁🏁🏁 Аукцион <b>№${e.id}</b> закончился
${e.top.length > 0 ? `Победитель <a href="tg://user?id=${e.top[0].user.id}">${e.top[0].user.id}</a> сделал ставку в <b>${e.top[0].bet}₽</b>` : `Победитель не определён`}`, {parse_mode});
    }); 
}

if (config.updateInfo) {
    setInterval(updateAll, 10 * 1000);
    updateAll();
}

setTimeout(() => {process.exit(0)}, 1000 * 60 * 20);
