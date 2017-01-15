const _ = require('lodash')
const app = require('express')()
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))

let connections = []
let state
let active = false
let turn

const emitHands = players => players.forEach(p => p.socket.emit('hand', p.hand))
const emitTurn = whosTurn => connections.forEach(p => p.socket.emit('turn', whosTurn))

io.on('connection', socket => {

    socket.emit('state', 'ENTER A USERNAME TO JOIN THE GAME')

    socket.on('username', username => {
        // TODO check for no overlaps?
        socket.username = username.data
        socket.emit('usernameConfirmed', socket.username)

        connections.push({ id: socket.id, socket })
        io.emit('state', `${socket.username} entered the game. There are now ${connections.length} players.`)
    })

    socket.on('data', data => {
        if (active) {
            const curPlayer = state.players.filter(p => p.id == data.id)[0]
            const nextPlayer = state.players.filter(p => p.player == (curPlayer.player + 1) % state.players.length)[0]
            const otherPlayers = state.players.filter(p => p.id != data.id)
            const isTheirTurn = turn == curPlayer.id

            switch (data.data.toUpperCase()) {
                case 'DONE':
                    if (isTheirTurn == false) break
                    if (curPlayer.hand.includes('BOMB')) {
                        io.emit('state', curPlayer.socket.username + " EXPLODED!")
                        turn = nextPlayer.id
                        break
                    }
                    curPlayer.hand.push(...state.deck.slice(0, curPlayer.take))
                    state.deck.splice(0, curPlayer.take)
                    if (curPlayer.hand.includes('BOMB')) {
                        io.emit('state', curPlayer.socket.username + " PICKED UP A BOMB!")
                        break
                    }
                    else {
                        io.emit('state', `${curPlayer.socket.username} ENDED THEIR TURN BY PICKING UP ${curPlayer.take} CARDS`)
                    }
                    curPlayer.take = 1
                    turn = nextPlayer.id
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
                        curPlayer.take = Math.max(0, curPlayer.take - 1)
                        io.emit('state', `${curPlayer.socket.username} SKIPPED`)
                    }
                    break
                case 'ATTACK':
                    if (isTheirTurn && curPlayer.hand.includes('ATTACK')) {
                        curPlayer.hand.splice(curPlayer.hand.indexOf('ATTACK'), 1)
                        curPlayer.take = 0
                        nextPlayer.take = 2
                        nextPlayer.socket.emit('state', 'ON YOUR TURN YOU MUST PICK UP 2 CARDS')
                        io.emit('state', `${curPlayer.socket.username} ATTACKED`)
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
                    active = false
                    break
                case 'DEBUG':
                    console.log(state)
                    break
                default:
                    io.emit('state', `${socket.username}: ${data.data}`)
                    break
            }

            emitTurn(turn)
            emitHands(state.players)
        }
        // not active
        else if (data.data == 'start') {
            active = true
            state = setup(connections)
            turn = _.shuffle(connections.filter(p => p.socket.username))[0].id
            io.emit('state', `GAME STARTED, ${connections.filter(p => p.id === turn)[0].socket.username} TO PLAY FIRST`)
            emitHands(state.players)
            emitTurn(turn)
        }
        else
            io.emit('state', `${socket.username}: ${data.data}`)
    })

    socket.on('disconnect', () => {
        if (socket.username) {
            connections = connections.filter(p => p.id != socket.id)
            io.emit('state', `${socket.username} left the game. There are now ${connections.length} players.`)
        }
    })
})

http.listen(3000)

const setup = players => {
    const cards = {
        NOPE: 5, ATTACK: 4, SKIP: 4, FUTURE: 5, SHUFFLE: 4, FAVOUR: 4,
        ZOMBIE: 4, BIKINI: 4, SCHRODINGER: 4, MOMMA: 4, BLADDER: 4
    }

    const deck = _(cards)
        .flatMap((v, k) => Array(v).fill(k))  // create all the cards based on the amounts
        .shuffle()                            // shuffle the deck
        .value()

    const gamePlayers = players.map((player, i) => {
        const hand = _(deck).take(4).push('DEFUSE').shuffle().value()
        deck.splice(0, 4)
        return { id: player.id, socket: player.socket, player: i, hand, take: 1 }
    })

    // add correct amount of bombs
    deck.push(...Array(players.length - 1).fill('BOMB'))

    // add extra defuse cards
    deck.push(...Array(players.length == 2 ? 2 : 6 - players.length).fill('DEFUSE'))

    return { deck: _.shuffle(deck), players: gamePlayers }
}