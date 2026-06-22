# GameHub Architecture

## Overview

GameHub is a multiplayer gaming platform built using modern web technologies. The architecture is designed to be scalable and maintainable, leveraging both frontend and backend components to provide a seamless gaming experience for players.

## Components

### Frontend

The frontend of GameHub is built using Next.js, a React framework that supports server-side rendering (SSR) and static site generation (SSG). It communicates with the backend via WebSockets using Socket.io.

#### Key Files and Directories

- **`frontend/app/page.tsx`**: The entry point for the frontend application.
- **`frontend/components/`**: Contains reusable React components such as `CreateGame`, `JoinGame`, and game-related components like `Board`, `GameLog`, and `PlayerPanel`.
- **`frontend/lib/socket.ts`**: Manages WebSocket connections to the backend server.

### Backend

The backend of GameHub is built using Node.js with Express for handling HTTP requests and Socket.io for real-time communication. It manages game state, player interactions, and room management.

#### Key Files and Directories

- **`backend/src/server.ts`**: The entry point for the backend server.
- **`backend/src/rooms/roomManager.ts`**: Manages room creation, joining, and disconnection of players.
- **`backend/src/games/monopoly/gameManager.ts`**: Handles game-specific logic for Monopoly, including dice rolls, property purchases, and turn management.
- **`backend/src/sockets/.gitkeep`**: Placeholder to ensure the `sockets` directory is tracked by Git.

## Multiplayer Functionality

GameHub supports multiplayer gameplay through real-time communication between clients and the server using WebSockets. The following events are handled:

1. **Room Management**:
   - **Create Room**: A player can create a new game room.
   - **Join Room**: Players can join existing rooms.
   - **Leave Room**: Players can leave rooms.

2. **Game Actions**:
   - **Roll Dice**: Players can roll dice to move on the board.
   - **Buy Property**: Players can purchase properties.
   - **Skip Property**: Players can choose to skip landing on a property.
   - **End Turn**: Players can end their turn.

3. **Reconnection**:
   - The system supports player reconnection with a 5-minute window after disconnection.

## Missing Pieces

While the core architecture is in place, there are still some missing pieces that need to be implemented:

1. **Complete Game Logic**: Implement all necessary game rules and actions for Monopoly.
2. **UI Components**: Develop additional UI components to display game information, player status, and other relevant data.
3. **Error Handling**: Add comprehensive error handling for various scenarios (e.g., invalid moves, disconnections).
4. **Testing**: Implement unit tests and integration tests to ensure the functionality works as expected.

## Contributing

To contribute to GameHub, please follow these guidelines:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with descriptive messages.
4. Push your changes to your forked repository.
5. Submit a pull request to the main repository.

## License

GameHub is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
