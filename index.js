const _ = require('lodash')
const app = require('express')()
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))

// const playerFormat = {
//     hand: [],                      // current hand [string, string, etc...]
//     username: "Jim Bob",           // also in socket
//     id: "hjgFGY567fgFkj5678fGHj",  // unique id hoisted out of socket
//     pickup: 1,                     // how many to pick up at end of turn
//     socket: {},                    // socket.io object
// }

// TODO
// - ending is still fucked
// - where to insert bomb after defuse
// - which card to steal
// - choosing a card for favours
// - triple pair
// - split chat and cards
// - delay on performing card action so that nopes can be implemented
// - nopes

const state = {
    history: [],         // previous states
    observers: [],       // socket connections staging ground - moved to players upon start
    players: [],         // socket connections with a username + game details
    deck: [],            // current deck [string, string, etc...]
    gameActive: false,   // currently in a game?
    whosTurn: undefined, // who's turn is it?
    nopeDelay: 2000,     // how long people get to nope things, in milliseconds
    canNope: false,      // can people currently nope?
    nopeCount: 0,        // how many nopes were played?
}

const emitHands = state => state.players.forEach(p => p.socket.emit('hand', p.hand))
const emitTurn = state => state.players.forEach(p => p.socket.emit('turn', state.whosTurn))
const emitCounts = state => state.players.forEach(p => p.socket.emit('counts', { deck: state.deck.length, players: state.players.map(p1 => ({ username: p1.username, cards: p1.hand.length })) }))
const emitState = state => [emitHands, emitTurn, emitCounts].forEach(fn => fn(state))
const messageAll = message => io.emit('message', message)

io.on('connection', socket => {

    socket.emit('message', 'ENTER A USERNAME TO JOIN THE GAME')

    socket.on('username', username => {
        if (state.observers.filter(s => s.username == username).length > 0)
            socket.emit('message', `${username} is taken, try another.`)
        else {
            socket.username = username
            socket.emit('usernameConfirmed', socket.username)

            state.observers.push(socket)
            messageAll(`${socket.username} entered the game. There are now ${state.observers.length} players.`)
        }
    })

    socket.on('data', data => {
        if (state.gameActive) {
            const curPlayer = state.players.filter(p => p.id == socket.id)[0]
            const nextPlayer = state.players[(state.players.indexOf(curPlayer) + 1) % state.players.length]
            const otherPlayers = state.players.filter(p => p.id != socket.id)
            const isTheirTurn = state.whosTurn == curPlayer.id
            const notTheirTurn = !isTheirTurn
            const hasCard = card => curPlayer.hand.includes(card)
            const removeCard = card => curPlayer.hand.splice(curPlayer.hand.indexOf(card), 1)
            const messageOthers = message => otherPlayers.forEach(p => p.socket.emit('message', message))
            const messageCurPlayer = message => socket.emit('message', message)

            switch (data.toUpperCase()) {
                case 'DONE':
                    if (notTheirTurn) break
                    if (hasCard('BOMB')) {
                        messageAll(curPlayer.socket.username + " EXPLODED!")
                        state.whosTurn = nextPlayer.id
                        break
                    }
                    curPlayer.hand.push(...state.deck.slice(0, curPlayer.pickup))
                    state.deck.splice(0, curPlayer.pickup)
                    if (hasCard('BOMB')) {
                        messageAll(curPlayer.socket.username + " PICKED UP A BOMB!")
                        break
                    }
                    else {
                        messageAll(`${curPlayer.socket.username} ENDED THEIR TURN BY PICKING UP ${curPlayer.pickup} CARDS`)
                    }
                    curPlayer.pickup = 1
                    state.whosTurn = nextPlayer.id
                    break
                case 'DEFUSE':
                    if (notTheirTurn) break
                    if (hasCard('BOMB') && hasCard('DEFUSE')) {
                        removeCard('BOMB')
                        removeCard('DEFUSE')
                        state.deck.splice(Math.ceil(state.deck.length / 2), 0, "BOMB")
                        messageAll('BOMB DEFUSED AND ADDED BACK INTO DECK AT HALFWAY POINT (bit crap)')
                    }
                    break
                case 'COUNT':
                    messageCurPlayer(`${state.deck.length} cards left in the draw pile`)
                    otherPlayers.forEach(p => messageCurPlayer(`${p.username} has ${p.hand.length} cards`))
                    break
                case 'NOPE':
                    if (state.canNope && hasCard('NOPE')) {
                        removeCard('NOPE')
                        messageAll(`${curPlayer.socket.username} NOPED!`)
                        state.nopeCount++
                    }
                    break
                case 'FUTURE':
                    if (isTheirTurn && hasCard('FUTURE')) {
                        messageAll(`${curPlayer.socket.username} IS GOING TO VIEW FUTURE`)
                        removeCard('FUTURE')
                        state.canNope = true
                        setTimeout(() => {
                            if (state.nopeCount % 2 == 0) {
                                messageCurPlayer("TOP 3 CARDS: " + state.deck.slice(0, 3))
                                messageOthers(`${curPlayer.socket.username} VIEWED THE FUTURE`)
                            }
                            state.canNope = false
                            state.nopeCount = 0
                        }, state.nopeDelay)
                    }
                    break
                case 'SHUFFLE':
                    if (isTheirTurn && hasCard('SHUFFLE')) {
                        removeCard('SHUFFLE')
                        state.deck = _.shuffle(state.deck)
                        messageAll(`${curPlayer.socket.username} SHUFFLED THE DECK`)
                    }
                    break
                case 'FAVOUR':
                    if (isTheirTurn && hasCard('FAVOUR')) {
                        removeCard('FAVOUR')
                        curPlayer.hand.push(nextPlayer.hand.pop())

                        messageCurPlayer("WHO FROM?\n" + otherPlayers.map(p => p.player + ": " + p.socket.username).join("\n"))

                        messageAll(`${curPlayer.socket.username} ASKED FOR A FAVOUR FROM ${nextPlayer.socket.username}`)
                    }
                    break
                case 'SKIP':
                    if (isTheirTurn && hasCard('SKIP')) {
                        removeCard('SKIP')
                        curPlayer.pickup = Math.max(0, curPlayer.pickup - 1)
                        messageAll(`${curPlayer.socket.username} SKIPPED`)
                    }
                    break
                case 'ATTACK':
                    if (isTheirTurn && hasCard('ATTACK')) {
                        removeCard('ATTACK')
                        curPlayer.pickup = 0
                        nextPlayer.pickup = 2
                        messageAll(`${curPlayer.socket.username} ATTACKED! ${nextPlayer.socket.username} MUST PICK UP 2 CARDS AT THE END OF THEIR TURN!`)
                    }
                    break
                case 'BIKINI':
                case 'ZOMBIE':
                case 'MOMMA':
                case 'SCHRODINGER':
                case 'BLADDER':
                case 'PAIR':
                    if (isTheirTurn) {

                        // search for pairs
                        const pairs = _(curPlayer.hand).countBy().pickBy((v, k) => v > 1).map((v, k) => k).value()
                        const catPairs = _.intersection(pairs, ['ZOMBIE', 'BIKINI', 'SCHRODINGER', 'MOMMA', 'BLADDER'])

                        if (catPairs.length > 0) {
                            // remove the 2 cards
                            curPlayer.hand = curPlayer.hand.filter((card, index) => index != curPlayer.hand.indexOf(catPairs[0]))
                            curPlayer.hand = curPlayer.hand.filter((card, index) => index != curPlayer.hand.indexOf(catPairs[0]))

                            // steal card from the next player (needs improving obviously)
                            curPlayer.hand.push(nextPlayer.hand.pop())

                            messageAll(`${curPlayer.socket.username} STOLE A CARD FROM ${nextPlayer.socket.username}`)
                        }
                    }
                    break
                case 'QUIT':
                    state.gameActive = false
                    break
                case 'DEBUG':
                    console.log(state)
                    break
                default:
                    messageAll(`${socket.username}: ${data}`)
                    break
            }

            emitState(state)
        }
        // not active
        else if (data.toUpperCase() == 'START') {
            const gameData = setup(state.observers)
            state.gameActive = true
            state.deck = gameData.deck
            state.players = gameData.players
            state.whosTurn = _.shuffle(state.players.filter(player => player.username))[0].id
            messageAll(`GAME STARTED, ${state.players.filter(player => player.id === state.whosTurn)[0].username} TO PLAY FIRST`)
            emitState(state)
        }
        // chatting
        else
            messageAll(`${socket.username}: ${data}`)
    })

    socket.on('disconnect', () => {
        state.observers = state.observers.filter(p => p.id != socket.id)
        state.players = state.players.filter(p => p.id != socket.id)

        if (socket.username) {
            messageAll(`${socket.username} left the game. There are now ${state.players.length} players.`)
        }
    })
})

http.listen(3000)

const setup = players => {
    const cards = {
        NOPE: 5, ATTACK: 4, SKIP: 4, FUTURE: 5, SHUFFLE: 4, FAVOUR: 4,
        ZOMBIE: 4, BIKINI: 4, SCHRODINGER: 4, MOMMA: 4, BLADDER: 4
    }

    const deck = _(cards).flatMap((amtOfCard, cardID) => Array(amtOfCard).fill(cardID)).shuffle().value()

    const gamePlayers = players.map(socket => {
        const hand = _(deck).take(4).push('DEFUSE').shuffle().value()
        deck.splice(0, 4)
        return {
            hand: hand,
            username: socket.username,
            id: socket.id,
            pickup: 1,
            socket: socket
        }
    })

    // add correct amount of bombs
    deck.push(...Array(players.length - 1).fill('BOMB'))

    // add extra defuse cards
    deck.push(...Array(players.length == 2 ? 2 : 6 - players.length).fill('DEFUSE'))

    return { deck: _.shuffle(deck), players: gamePlayers }
}