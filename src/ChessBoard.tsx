import React, { useState } from 'react';
import { ChessInstance } from 'chess.js';
import ChessSquare from './ChessSquare';
import { ChessBoardProps } from './types';

const ChessBoard: React.FC<ChessBoardProps> = ({ flipBoardEnabled, ...props }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [chess, setChess] = useState<ChessInstance>(new ChessInstance());

    const handleMove = (move: any) => {
        chess.move(move);
        setChess(new ChessInstance(chess.fen()));
        if (flipBoardEnabled) {
            setIsFlipped(prev => !prev);
        }
    };

    return (
        <div
            className="board-container"
            style={{
                transform: isFlipped ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.5s'
            }}
        >
            {chess.board().map((row, rowIndex) => (
                <div key={rowIndex} className="board-row">
                    {row.map((square, colIndex) => (
                        <ChessSquare
                            key={colIndex}
                            piece={square}
                            position={{ row: rowIndex, col: colIndex }}
                            onMove={handleMove}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};

export default ChessBoard;