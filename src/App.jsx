import { useState, useEffect } from "react";
import HangmanVisual from "./HangmanVisual";
import HangmanWord from "./HangmanWord";
import GuessedLetters from "./GuessedLetters";
import "./App.css";

const WORD_TO_GUESS = "MOREHOUSE";
const MAX_LIVES = 6;
const API_URL = "http://localhost:5001/api/players";

export default function App() {
  // 1. Player & Login State
  const [nameInput, setNameInput] = useState("");
  const [player, setPlayer] = useState({ playerID: "", playerName: "", wins: 0, losses: 0 });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [statsUpdated, setStatsUpdated] = useState(false);

  // Existing Game State
  const [wordToGuess, setWordToGuess] = useState(WORD_TO_GUESS);
  const [guessedLetters, setGuessedLetters] = useState(new Set());

  const incorrectGuesses = Array.from(guessedLetters).filter(
    (letter) => !wordToGuess.includes(letter)
  ).length;

  const isLost = incorrectGuesses >= MAX_LIVES;
  const isWon = wordToGuess.split("").every((letter) => guessedLetters.has(letter));

  // Calculate Win Percentage
  const totalGames = player.wins + player.losses;
  const winPercentage = totalGames > 0 ? Math.round((player.wins / totalGames) * 100) : 0;

  // 2. Login Handler (GET -> if 404, POST)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const res = await fetch(`${API_URL}?playerName=${encodeURIComponent(nameInput.trim())}`);

    if (res.ok) {
      setPlayer(await res.json());
      setIsLoggedIn(true);
    } else if (res.status === 404) {
      const createRes = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: nameInput.trim() }),
      });
      if (createRes.ok) {
        setPlayer(await createRes.json());
        setIsLoggedIn(true);
      }
    }
  };

  const addGuessedLetter = (letter) => {
    if (!isLoggedIn || guessedLetters.has(letter) || isWon || isLost) return;
    setGuessedLetters((prev) => new Set(prev).add(letter));
  };

  useEffect(() => {
    const handler = (e) => {
      const key = e.key.toUpperCase();
      if (key.match(/^[A-Z]$/)) addGuessedLetter(key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [guessedLetters, isWon, isLost, isLoggedIn]);

  // 3. Update local state first, then send PUT request on Win/Loss
  useEffect(() => {
    if ((!isWon && !isLost) || !isLoggedIn || statsUpdated) return;

    setStatsUpdated(true);
    const updatedStats = {
      wins: isWon ? player.wins + 1 : player.wins,
      losses: isLost ? player.losses + 1 : player.losses,
    };

    // Update React state locally first
    setPlayer((prev) => ({ ...prev, ...updatedStats }));

    // Save to DynamoDB via PUT
    fetch(`${API_URL}/${player.playerID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedStats),
    });
  }, [isWon, isLost, isLoggedIn, statsUpdated, player]);

  const resetGame = () => {
    setWordToGuess(WORD_TO_GUESS);
    setGuessedLetters(new Set());
    setStatsUpdated(false);
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px", textAlign: "center" }}>
      <h1>Hangman Game</h1>

      {/* 4. Login Form OR Player Stats Bar */}
      {!isLoggedIn ? (
        <form onSubmit={handleLogin} style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="Enter your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            style={{ padding: "8px", marginRight: "8px" }}
          />
          <button type="submit" className="btn-new-game">Login</button>
        </form>
      ) : (
        <p style={{ fontWeight: "bold", marginBottom: "15px" }}>
          Player: {player.playerName} | Wins: {player.wins} | Losses: {player.losses} | Win Rate: {winPercentage}%
        </p>
      )}

      {(isWon || isLost) && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{isWon ? "You Won!" : "Game Over!"}</h2>
            <p>{isWon ? "Great job guessing the word!" : `The word was: ${wordToGuess}`}</p>
            <button className="btn-new-game" onClick={resetGame}>Play Again</button>
          </div>
        </div>
      )}

      <HangmanVisual numberOfGuesses={incorrectGuesses} maxLives={MAX_LIVES} />
      <HangmanWord wordToGuess={wordToGuess} guessedLetters={guessedLetters} isLost={isLost} />
      <GuessedLetters guessedLetters={guessedLetters} />

      <div style={{ marginTop: "30px" }}>
        <button className="btn-new-game" onClick={resetGame}>New Game</button>
      </div>
    </div>
  );
}