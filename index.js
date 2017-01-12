const _ = require('lodash')
const app = require('express')()
const http = require('http').Server(app);
const io = require('socket.io')(http);
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))

let players = []
let state
let active = false
let turn

const emitHands = players => players.forEach(p => p.socket.emit('hand', p.hand.join(' ')))
const emitTurn = whosTurn => players.forEach(p => p.socket.emit('turn', whosTurn))

io.on('connection', socket => {
    players.push({ id: socket.id, socket })
    socket.emit('state', `You are ${socket.id}`)
    io.emit('state', `${socket.id} entered the game. There are now ${players.length} players.`)

    socket.on('data', data => {
        if (active) {
            const current = state.players.filter(p => p.id == data.id)[0]
            const next = state.players.filter(p => p.player == (current.player + 1) % state.players.length)[0]
            const isTheirTurn = turn == current.id

            switch (data.data.toUpperCase()) {
                case 'DONE':
                    if (isTheirTurn == false) break
                    if (current.hand.includes('BOMB')) {
                        io.emit('state', current.id + " EXPLODED!")
                        turn = next.id
                        break
                    }
                    current.hand.push(...state.deck.slice(0, current.take))
                    state.deck.splice(0, current.take)
                    if (current.hand.includes('BOMB')) {
                        io.emit('state', current.id + " PICKED UP A BOMB!")
                        break
                    }
                    current.take = 1
                    turn = next.id
                    break
                case 'DEFUSE':
                    if (isTheirTurn == false) break
                    if (current.hand.includes('BOMB') && current.hand.includes('DEFUSE')) {
                        current.hand.splice(current.hand.indexOf('BOMB'), 1)
                        current.hand.splice(current.hand.indexOf('DEFUSE'), 1)
                        state.deck.splice(Math.ceil(state.deck.length / 2), 0, "BOMB")
                        io.emit('state', 'BOMB DEFUSED AND ADDED BACK INTO DECK AT HALFWAY POINT (bit crap)')
                    }
                    break
                case 'COUNT':
                    current.socket.emit('state', state.deck.length)
                    break
                case 'FUTURE':
                    if (isTheirTurn && current.hand.includes('FUTURE')) {
                        current.hand.splice(current.hand.indexOf('FUTURE'), 1)
                        current.socket.emit('state', "TOP 3 CARDS: " + state.deck.slice(0, 3))
                        io.emit('state', `${current.id} VIEWED THE FUTURE`)
                    }
                    break
                case 'SHUFFLE':
                    if (isTheirTurn && current.hand.includes('SHUFFLE')) {
                        current.hand.splice(current.hand.indexOf('SHUFFLE'), 1)
                        state.deck = _.shuffle(state.deck)
                        io.emit('state', `${current.id} SHUFFLED THE DECK`)
                    }
                    break
                case 'FAVOUR':
                    if (isTheirTurn && current.hand.includes('FAVOUR')) {
                        current.hand.splice(current.hand.indexOf('FAVOUR'), 1)
                        current.hand.push(next.hand.pop())
                        next.socket.emit('state', "YOU WERE FAVOURED FROM.")
                        io.emit('state', `${current.id} ASKED FOR A FAVOUR FROM ${next.id}`)
                    }
                    break
                case 'SKIP':
                    if (isTheirTurn && current.hand.includes('SKIP')) {
                        current.hand.splice(current.hand.indexOf('SKIP'), 1)
                        current.take = Math.max(0, current.take - 1)
                        io.emit('state', `${current.id} SKIPPED`)
                    }
                    break
                case 'ATTACK':
                    if (isTheirTurn && current.hand.includes('ATTACK')) {
                        current.hand.splice(current.hand.indexOf('ATTACK'), 1)
                        current.take = 0
                        next.take = 2
                        next.socket.emit('state', 'ON YOUR TURN YOU MUST PICK UP 2 CARDS')
                        io.emit('state', `${current.id} ATTACKED`)
                    }
                    break
                case 'PAIR':
                    if (isTheirTurn) {

                        // search for pairs
                        const pairs = _(current.hand).countBy().pickBy((v, k) => v > 1).map((v, k) => k).value()
                        const catPairs = _.intersection(pairs, ['ZOMBIE', 'BIKINI', 'SCHRODINGER', 'MOMMA', 'BLADDER'])

                        if (catPairs.length > 0) {
                            // remove the 2 cards
                            current.hand = current.hand.filter((card, index) => index != current.hand.indexOf(catPairs[0]))
                            current.hand = current.hand.filter((card, index) => index != current.hand.indexOf(catPairs[0]))

                            // steal card from the next player (needs improving obviously)
                            current.hand.push(next.hand.pop())

                            next.socket.emit('state', "YOU WERE STOLEN FROM.")
                            io.emit('state', `${current.id} STOLE A CARD FROM ${next.id}`)
                        }
                    }
                    break
                default:
                    io.emit('state', `${socket.id}: ${data.data}`)
                    break
            }

            emitTurn(turn)
            emitHands(state.players)
        }

        if (data.data == 'debug') console.log(state)
        if (data.data == 'quit') active = false
        if (data.data == 'start') {
            active = true
            state = setup(players)
            turn = players[0].id
            io.emit('state', `${turn} to play`)
            emitHands(state.players)
            emitTurn(turn)
        }
    })

    socket.on('disconnect', () => {
        io.emit('state', `${socket.id} left the game. There are now ${players.length} players.`)
        players = players.filter(p => p.id != socket.id)
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