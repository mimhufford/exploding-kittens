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
const emitPlayerChange = (players, whosTurn) => players.forEach(p => p == whosTurn ? undefined : undefined)

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
                    current.hand.push(...state.deck.slice(0, current.take))
                    emitHands(state.players)
                    state.deck.splice(0, current.take)
                    current.take = 1
                    turn = next.id
                    io.emit('state', `${turn} to play`)
                    break
                case 'COUNT':
                    current.socket.emit('state', state.deck.length)
                    break
                case 'FUTURE':
                    if (isTheirTurn && current.hand.includes('FUTURE')) {
                        current.hand.splice(current.hand.indexOf('FUTURE'), 1)
                        current.socket.emit('state', "TOP 3 CARDS: " + state.deck.slice(0, 3))
                        emitHands(state.players)
                    }
                    break
                case 'SHUFFLE':
                    if (isTheirTurn && current.hand.includes('SHUFFLE')) {
                        current.hand.splice(current.hand.indexOf('SHUFFLE'), 1)
                        state.deck = _.shuffle(state.deck)
                        io.emit('state', current.id + ' SHUFFLED THE DECK')
                        emitHands(state.players)
                    }
                    break
                case 'FAVOUR':
                    if (isTheirTurn && current.hand.includes('FAVOUR')) {
                        current.hand.splice(current.hand.indexOf('FAVOUR'), 1)
                        current.hand.push(next.hand.pop())
                        emitHands(state.players)
                        next.socket.emit('state', "YOU WERE FAVOURED FROM.")
                    }
                    break
                case 'SKIP':
                    if (isTheirTurn && current.hand.includes('SKIP')) {
                        current.hand.splice(current.hand.indexOf('SKIP'), 1)
                        current.take = Math.max(0, current.take - 1)
                        emitHands(state.players)
                    }
                    break
                case 'ATTACK':
                    if (isTheirTurn && current.hand.includes('ATTACK')) {
                        current.hand.splice(current.hand.indexOf('ATTACK'), 1)
                        current.take = 0
                        next.take = 2
                        emitHands(state.players)
                        next.socket.emit('state', 'ON YOUR TURN YOU MUST PICK UP 2 CARDS')
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

                            emitHands(state.players)
                            next.socket.emit('state', "YOU WERE STOLEN FROM.")
                        }
                    }
                    break
                default:
                    io.emit('state', `${socket.id}: ${data.data}`)
                    break
            }
        }
        if (data.data == 'debug') console.log(state)
        if (data.data == 'quit') active = false
        if (data.data == 'start') {
            active = true
            state = setup(players)
            turn = players[0].id
            io.emit('state', `${turn} to play`)
            emitHands(state.players)
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

    return { deck, players: gamePlayers }
}