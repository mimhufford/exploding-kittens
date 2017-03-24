const _ = require('lodash')
const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)

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
// - don't pick up after defusing bomb
// - which card to steal
// - triple pair
// - pair should tell the person which card was nicked because it's easy to forget

const state = {
    history: [],          // previous states
    observers: [],        // socket connections staging ground - moved to players upon start
    players: [],          // socket connections with a username + game details
    deck: [],             // current deck [string, string, etc...]
    gameActive: false,    // currently in a game?
    whosTurn: undefined,  // who's turn is it?
    nopeDelay: 2000,      // how long people get to nope things, in milliseconds
    lastNopeTime: 0,      // when was the last nope (so we can add to delays)
    canNope: false,       // can people currently nope?
    nopeCount: 0,         // how many nopes were played?
}

const emitHands = state => state.players.forEach(p => p.socket.emit('hand', p.hand))
const emitTurn = state => state.players.forEach(p => p.socket.emit('turn', state.whosTurn))
const emitCounts = state => state.players.forEach(p => p.socket.emit('counts', { deck: state.deck.length, players: state.players.map(p1 => ({ username: p1.username, cards: p1.hand.length })) }))
const emitState = state => [emitHands, emitTurn, emitCounts].forEach(fn => fn(state))
const messageAll = message => io.emit('log', message)

const playCardWithDelay = action => {
    state.canNope = true

    const resolve = action => () => {
        const howLongSinceLastNope = Date.now() - state.lastNopeTime
        const peopleHaveNoped = howLongSinceLastNope < state.nopeDelay
        const howMuchLongerToWait = state.nopeDelay - howLongSinceLastNope

        if (peopleHaveNoped) setTimeout(resolve(action), howMuchLongerToWait)
        else {
            if (state.nopeCount % 2 == 0)
                action()
            state.canNope = false
            state.nopeCount = 0
        }

        emitState(state)
    }

    setTimeout(resolve(action), state.nopeDelay)
}

io.on('connection', socket => {

    socket.emit('log', 'ENTER A USERNAME TO JOIN THE GAME')

    socket.on('username', username => {
        if (state.observers.filter(s => s.username == username).length > 0)
            socket.emit('log', `${username} is taken, try another.`)
        else {
            socket.username = username
            socket.emit('usernameConfirmed', socket.username)

            state.observers.push(socket)
            messageAll(`${socket.username} entered the game. There are now ${state.observers.length} players.`)
        }
    })

    socket.on('chat', message => {
        switch (message.toUpperCase()) {
            case 'COUNT':
                socket.emit('log', `${state.deck.length} cards left in the draw pile`)
                state.players.filter(p => p.id != socket.id).forEach(p => socket.emit('log', `${p.username} has ${p.hand.length} cards`))
                break
            case 'QUIT':
                state.gameActive = false
                break
            case 'DEBUG':
                console.log(state)
                break
            case 'START':
                const gameData = setup(state.observers)
                state.gameActive = true
                state.deck = gameData.deck
                state.players = gameData.players
                state.whosTurn = _.shuffle(state.players.filter(player => player.username))[0].id
                messageAll(`GAME STARTED, ${state.players.filter(player => player.id === state.whosTurn)[0].username} TO PLAY FIRST`)
                emitState(state)
                break
            default:
                io.emit('message', `${socket.username}: ${message}`)
                break
        }
    })

    socket.on('data', data => {
        if (state.gameActive == false) return

        const curPlayer = state.players.filter(p => p.id == socket.id)[0]
        const nextPlayer = state.players[(state.players.indexOf(curPlayer) + 1) % state.players.length]
        const otherPlayers = state.players.filter(p => p.id != socket.id)
        const isTheirTurn = state.whosTurn == curPlayer.id
        const notTheirTurn = !isTheirTurn
        const hasCard = (card, i) => curPlayer.hand[i] === card
        const removeCard = i => curPlayer.hand.splice(i, 1)
        const removeCardFrom = (player, i) => player.hand.splice(i, 1)
        const messageOthers = message => otherPlayers.forEach(p => p.socket.emit('log', message))
        const messageCurPlayer = message => socket.emit('log', message)

        switch (data.data.toUpperCase()) {
            case 'DONE':
                if (notTheirTurn) break
                if (curPlayer.hand.includes("BOMB")) {
                    messageAll(curPlayer.username + " EXPLODED!")
                    state.whosTurn = nextPlayer.id
                    break
                }
                curPlayer.hand.push(...state.deck.slice(0, curPlayer.pickup))
                state.deck.splice(0, curPlayer.pickup)
                if (curPlayer.hand.includes("BOMB")) {
                    messageAll(curPlayer.username + " PICKED UP A BOMB!")
                    break
                }
                else {
                    messageAll(`${curPlayer.username} ENDED THEIR TURN BY PICKING UP ${curPlayer.pickup} CARDS`)
                }
                curPlayer.pickup = 1
                state.whosTurn = nextPlayer.id
                break
            case 'DEFUSE':
                if (notTheirTurn) break
                if (curPlayer.hand.includes("BOMB") && hasCard(data.data, data.index)) {
                    removeCard('DEFUSE')
                    messageAll(`${curPlayer.username} IS GOING TO DEFUSE THE BOMB`)
                    playCardWithDelay(() => {
                        removeCard(curPlayer.hand.indexOf('BOMB'))
                        state.deck.splice(Math.ceil(state.deck.length / 2), 0, "BOMB")
                        messageAll(`${curPlayer.username} DEFUSED THE BOMB AND ADDED BACK AT HALFWAY POINT (bit crap)`)
                    })
                }
                break
            case 'NOPE':
                if (state.canNope && hasCard(data.data, data.index)) {
                    removeCard(data.index)
                    messageAll(`${curPlayer.username} NOPED!`)
                    state.nopeCount++
                    state.lastNopeTime = Date.now()
                }
                break
            case 'FUTURE':
                if (isTheirTurn && hasCard(data.data, data.index)) {
                    removeCard(data.index)
                    messageAll(`${curPlayer.username} IS GOING TO VIEW FUTURE`)
                    playCardWithDelay(() => {
                        messageCurPlayer("TOP 3 CARDS: " + state.deck.slice(0, 3))
                        messageOthers(`${curPlayer.username} VIEWED THE FUTURE`)
                    })
                }
                break
            case 'SHUFFLE':
                if (isTheirTurn && hasCard(data.data, data.index)) {
                    removeCard(data.index)
                    messageAll(`${curPlayer.username} IS GOING TO SHUFFLE THE DECK`)
                    playCardWithDelay(() => {
                        state.deck = _.shuffle(state.deck)
                        messageAll(`${curPlayer.username} SHUFFLED THE DECK`)
                    })
                }
                break
            case 'FAVOUR':
                if (isTheirTurn && hasCard(data.data, data.index)) {
                    removeCard(data.index)

                    state.waitingForUser = socket
                    // TODO: pause game
                    socket.emit('choice', { message: "Which player?", choices: otherPlayers.map(p => p.username) }, response => {
                        // TODO: resume game
                        // ROBUSTNESS: assumes the response from the client is valid
                        const target = otherPlayers.filter(p => p.username === response)[0]
                        messageAll(`${curPlayer.username} IS ASKING ${target.username} FOR A FAVOUR`)
                        playCardWithDelay(() => {
                            target.socket.emit('choice', { message: "Which card?", choices: target.hand }, response => {
                                // ROBUSTNESS: assumes the response from the client is valid
                                const index = target.hand.indexOf(response)
                                removeCardFrom(target, index)
                                curPlayer.hand.push(response)
                                messageAll(`${curPlayer.username} TOOK A FAVOUR FROM ${target.username}`)
                                emitState(state)
                            })
                        })
                    })
                }
                break
            case 'SKIP':
                if (isTheirTurn && hasCard(data.data, data.index)) {
                    removeCard(data.index)
                    messageAll(`${curPlayer.username} WANTS TO SKIP PICKING UP`)
                    playCardWithDelay(() => {
                        curPlayer.pickup = Math.max(0, curPlayer.pickup - 1)
                        messageAll(`${curPlayer.username} WILL SKIP PICKING UP`)
                    })
                }
                break
            case 'ATTACK':
                if (isTheirTurn && hasCard(data.data, data.index)) {
                    removeCard(data.index)
                    messageAll(`${curPlayer.username} IS GOING TO ATTACK ${nextPlayer.username}`)
                    playCardWithDelay(() => {
                        curPlayer.pickup = 0
                        nextPlayer.pickup = 2
                        messageAll(`${curPlayer.username} ATTACKED! ${nextPlayer.username} MUST PICK UP 2 CARDS AT THE END OF THEIR TURN!`)
                    })
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
                        //TODO: pause game
                        socket.emit(
                            'choose-player',
                            otherPlayers.map(p => p.username),
                            response => {
                                // TODO: resume game
                                // ROBUSTNESS: assumes the response from the client is valid
                                const chosenPlayer = otherPlayers.filter(p => p.username === response)[0]
                                messageAll(`${curPlayer.username} IS GOING TO STEAL A CARD FROM ${chosenPlayer.username}`)
                                playCardWithDelay(() => {
                                    curPlayer.hand.push(chosenPlayer.hand.pop())
                                    messageAll(`${curPlayer.username} STOLE A CARD FROM ${chosenPlayer.username}`)
                                })
                            }
                        )
                    }
                }
                break
            default:
                break
        }

        emitState(state)
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
