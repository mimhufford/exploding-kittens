const cardTypes = [
    'BOMB', 'DEFUSE',
    'NOPE', 'ATTACK', 'SKIP', 'FUTURE', 'SHUFFLE', 'FAVOUR',
    'ZOMBIE', 'BIKINI', 'SCHRODINGER', 'MOMMA'
]

const deck = ['SKIP', 'BIKINI', 'MOMMA', 'FUTURE', 'BOMB', 'DEFUSE', 'etc']

const players = [
    {
        name: "Example",
        hand: ['DEFUSE', 'ATTACK', 'BIKINI', 'BIKINI'],
        pickup: 1 // skip = 0 , attack = 2
    }
]

// need a finished button (either takes a card (or 2) or just ends turn depending on attack / skip)
// deck does have to be an ordered list so that seeing the future and putting the bomb in a certain place works
// stealing a card from somebody could be random but maybe make it real in case people always put defuse on the edge?
// this means allowing people to reorder their hand though.. maybe just make it random at first