import React, { Component } from 'react'
import './App.css'

class Deck extends Component {
  render = () => {
    return (
      <button onClick={this.props.onDraw}>
        Deck<br /><br />
        ({this.props.deck.length} cards left)
      </button>
    )
  }
}

class Opponent extends Component {
  render = () => <div>Opponent</div>
}

class Hand extends Component {
  render = () => {
    return (
      <div>
        {
          this.props.hand.map((card, i) => {
            // Using an anonymous function so I can pass parameters to onPlay
            // it expects event paramters otherwise. I think this makes copies.
            return <button onClick={() => this.props.onPlay(i, card)} key={i}>{card}</button>
          })
        }
      </div>
    )
  }
}

const state = {
  hand: ['DEFUSE', 'FAVOUR', 'MOMMA', 'BIKINI', 'FUTURE'],
  deck: ['BIKINI', 'DEFUSE', 'BOMB', 'SKIP', 'ATTACK']
}

class App extends Component {
  constructor(props) {
    super(props)
    this.state = state
  }
  draw = () => {
    this.setState({ deck: this.state.deck.slice(1) })
  }
  play = (index, card) => {
    this.setState({ hand: [...this.state.hand.slice(0, index), ...this.state.hand.slice(index + 1)] })
  }
  render = () => {
    return (
      <div className="App">
        <Deck deck={this.state.deck} onDraw={this.draw} />
        <Hand hand={this.state.hand} onPlay={this.play} />
        <Opponent id={1} />
        <Opponent id={2} />
        <Opponent id={3} />
        <Opponent id={4} />
        <Opponent id={5} />
      </div>
    )
  }
}

export default App