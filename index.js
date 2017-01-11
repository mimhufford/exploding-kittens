const _ = require('lodash')
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })

const setup = numPlayers => {
    const cards = {
        NOPE: 5, ATTACK: 4, SKIP: 4, FUTURE: 5, SHUFFLE: 4, FAVOUR: 4,
        ZOMBIE: 4, BIKINI: 4, SCHRODINGER: 4, MOMMA: 4, BLADDER: 4
    }

    const deck = _(cards)
        .flatMap((v, k) => Array(v).fill(k))  // create all the cards based on the amounts
        .shuffle()                            // shuffle the deck
        .value()

    const players = Array(numPlayers).fill().map((v, i) => {
        const hand = _(deck).take(4).push('DEFUSE').shuffle().value()
        deck.splice(0, 4)
        return { player: i, hand, take: 1 }
    })

    // add correct amount of bombs
    deck.push(...Array(numPlayers - 1).fill('BOMB'))

    // add extra defuse cards
    deck.push(...Array(numPlayers == 2 ? 2 : 6 - numPlayers).fill('DEFUSE'))

    return [deck, players]
}

const play = (deck, players, turn = 0) => {
    const current = players[turn]
    const next = (turn + 1) % players.length
    console.log(players)
    rl.question(`Player ${turn}> `, answer => {
        switch (answer.toUpperCase()) {
            case 'QUIT':
                process.exit()
            case 'SHUFFLE HAND':
                players[turn].hand = _.shuffle(current.hand)
                play(deck, players, turn)
                break
            case 'SHUFFLE':
                if (current.hand.includes(answer.toUpperCase())) {
                    players[turn].hand.splice(current.hand.indexOf(answer.toUpperCase()), 1)
                    play(_.shuffle(deck), players, turn)
                }
                else {
                    console.log(`You do not have any ${answer} cards`)
                    play(deck, players, turn)
                }
                break
            case 'PAIR':
                // search for pairs
                const pairs = _(current.hand).countBy().pickBy((v, k) => v > 1).map((v, k) => k).value()
                const catPairs = _.intersection(pairs, ['ZOMBIE', 'BIKINI', 'SCHRODINGER', 'MOMMA', 'BLADDER'])

                if (catPairs.length > 0) {
                    // remove the 2 cards
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(catPairs[0]))
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(catPairs[0]))

                    // steal card from the next player (needs improving obviously)
                    players[turn].hand.push(players[next].hand.pop())
                }
                else
                    console.log(`You do not have any pairs`)

                play(deck, players, turn)
                break
            case 'FAVOUR':
                if (current.hand.includes(answer.toUpperCase())) {
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(answer.toUpperCase()))
                    
                    // steal card from the next player (needs improving obviously)
                    players[turn].hand.push(players[next].hand.pop())
                }
                else
                    console.log(`You do not have any ${answer} cards`)

                play(deck, players, turn)
                break
            case 'FUTURE':
                if (current.hand.includes(answer.toUpperCase())) {
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(answer.toUpperCase()))
                    console.log(deck.slice(0, 3))
                }
                else
                    console.log(`You do not have any ${answer} cards`)
                play(deck, players, turn)
                break
            case 'ATTACK':
                if (current.hand.includes(answer.toUpperCase())) {
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(answer.toUpperCase()))
                    players[turn].take = 0
                    players[next].take = 2
                }
                else
                    console.log(`You do not have any ${answer} cards`)
                play(deck, players, turn)
                break
            case 'SKIP':
                if (current.hand.includes(answer.toUpperCase())) {
                    players[turn].hand = current.hand.filter((card, index) => index != current.hand.indexOf(answer.toUpperCase()))
                    players[turn].take = current.take - 1
                }
                else
                    console.log(`You do not have any ${answer} cards`)
                play(deck, players, turn)
                break
            case 'DONE':
                players[turn].hand.push(...deck.slice(0, current.take))
                deck.splice(0, current.take)
                players[turn].take = 1
                if (current.hand.includes('BOMB'))
                    play(deck, players, turn)
                else
                    play(deck, players, next)
                break
            default:
                console.log("WTF?")
                play(deck, players, turn)
        }
    })
}

play(...setup(2))