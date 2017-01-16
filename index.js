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

const state = {
    history: [],         // previous states
    observers: [],       // socket connections staging ground - moved to players upon start
    players: [],         // socket connections with a username + game details
    deck: [],            // current deck [string, string, etc...]
    gameActive: false,   // currently in a game?
    whosTurn: undefined  // who's turn is it?
}

const emitHands = players => state.players.forEach(p => p.socket.emit('hand', p.hand))
const emitTurn = whosTurn => state.players.forEach(p => p.socket.emit('turn', whosTurn))

io.on('connection', socket => {

    socket.emit('state', 'ENTER A USERNAME TO JOIN THE GAME')

    socket.on('username', username => {
        // TODO check for no overlaps?
        socket.username = username.data
        socket.emit('usernameConfirmed', socket.username)

        state.observers.push(socket)
        io.emit('state', `${socket.username} entered the game. There are now ${state.observers.length} players.`)
    })

    socket.on('data', data => {
        if (state.gameActive) {
            const curPlayer = state.players.filter(p => p.id == data.id)[0]
            const nextPlayer = state.players[(state.players.indexOf(curPlayer) + 1) % state.players.length]
            const otherPlayers = state.players.filter(p => p.id != data.id)
            const isTheirTurn = state.whosTurn == curPlayer.id

            switch (data.data.toUpperCase()) {
                case 'DONE':
                    if (isTheirTurn == false) break
                    if (curPlayer.hand.includes('BOMB')) {
                        io.emit('state', curPlayer.socket.username + " EXPLODED!")
                        turn = nextPlayer.id
                        break
                    }
                    curPlayer.hand.push(...state.deck.slice(0, curPlayer.pickup))
                    state.deck.splice(0, curPlayer.pickup)
                    if (curPlayer.hand.includes('BOMB')) {
                        io.emit('state', curPlayer.socket.username + " PICKED UP A BOMB!")
                        break
                    }
                    else {
                        io.emit('state', `${curPlayer.socket.username} ENDED THEIR TURN BY PICKING UP ${curPlayer.pickup} CARDS`)
                    }
                    curPlayer.pickup = 1
                    state.whosTurn = nextPlayer.id
                    break
                case 'DEFUSE':
                    if (isTheirTurn == false) break
                    if (curPlayer.hand.includes('BOMB') && curPlayer.hand.includes('DEFUSE')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('BOMB'), 1)
                        curPlayer.hand.splice(curPlayer.hand.indexOf('DEFUSE'), 1)
                        state.deck.splice(Math.ceil(state.deck.length / 2), 0, "BOMB")
                        io.emit('state', 'BOMB DEFUSED AND ADDED BACK INTO DECK AT HALFWAY POINT (bit crap)')
                    }
                    break
                case 'COUNT':
                    curPlayer.socket.emit('state', state.deck.length)
                    break
                case 'FUTURE':
                    if (isTheirTurn && curPlayer.hand.includes('FUTURE')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('FUTURE'), 1)
                        curPlayer.socket.emit('state', "TOP 3 CARDS: " + state.deck.slice(0, 3))
                        io.emit('state', `${curPlayer.socket.username} VIEWED THE FUTURE`)
                    }
                    break
                case 'SHUFFLE':
                    if (isTheirTurn && curPlayer.hand.includes('SHUFFLE')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('SHUFFLE'), 1)
                        state.deck = _.shuffle(state.deck)
                        io.emit('state', `${curPlayer.socket.username} SHUFFLED THE DECK`)
                    }
                    break
                case 'FAVOUR':
                    if (isTheirTurn && curPlayer.hand.includes('FAVOUR')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('FAVOUR'), 1)
                        curPlayer.hand.push(nextPlayer.hand.pop())

                        const test = "WHO FROM?\n" + otherPlayers.map(p => p.player + ": " + p.socket.username).join("\n")
                        socket.emit('state', test)

                        nextPlayer.socket.emit('state', "YOU WERE FAVOURED FROM.")
                        io.emit('state', `${curPlayer.socket.username} ASKED FOR A FAVOUR FROM ${nextPlayer.socket.username}`)
                    }
                    break
                case 'SKIP':
                    if (isTheirTurn && curPlayer.hand.includes('SKIP')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('SKIP'), 1)
                        curPlayer.pickup = Math.max(0, curPlayer.pickup - 1)
                        io.emit('state', `${curPlayer.socket.username} SKIPPED`)
                    }
                    break
                case 'ATTACK':
                    if (isTheirTurn && curPlayer.hand.includes('ATTACK')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('ATTACK'), 1)
                        curPlayer.pickup = 0
                        nextPlayer.pickup = 2
                        io.emit('state', `${curPlayer.socket.username} ATTACKED`)
                        nextPlayer.socket.emit('state', 'ON YOUR TURN YOU MUST PICK UP 2 CARDS')
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

                            nextPlayer.socket.emit('state', "YOU WERE STOLEN FROM.")
                            io.emit('state', `${curPlayer.socket.username} STOLE A CARD FROM ${nextPlayer.socket.username}`)
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
                    io.emit('state', `${socket.username}: ${data.data}`)
                    break
            }

            emitTurn(state.whosTurn)
            emitHands(state.players)
        }
        // not active
        else if (data.data == 'start') {
            const gameData = setup(state.observers)
            state.gameActive = true
            state.deck = gameData.deck
            state.players = gameData.players
            state.whosTurn = _.shuffle(state.players.filter(player => player.username))[0].id
            io.emit('state', `GAME STARTED, ${state.players.filter(player => player.id === state.whosTurn)[0].username} TO PLAY FIRST`)
            emitHands(state.players)
            emitTurn(state.whosTurn)
        }
        // chatting
        else
            io.emit('state', `${socket.username}: ${data.data}`)
    })

    socket.on('disconnect', () => {
        state.observers = state.observers.filter(p => p.id != socket.id)
        state.players = state.players.filter(p => p.id != socket.id)

        if (socket.username) {
            io.emit('state', `${socket.username} left the game. There are now ${state.players.length} players.`)
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