# 🤖 Chatbot Testing Framework

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A powerful testing framework for conversational AI, powered by Botium with semantic similarity testing capabilities.

## ✨ Features

- 🔍 **Semantic Testing** - Verify responses using cosine similarity
- 🚀 **Parallel Test Execution** - Run tests concurrently for faster feedback
- 🔑 **Session Management** - Automatic session creation and management
- 🌐 **REST API Integration** - Test any REST-based chatbot service

## 📋 Prerequisites

- Node.js (v12 or higher)
- npm (v6 or higher)

## 🚀 Getting Started

### Installation

```bash
# Clone the repository
git clone <your-repo-url>

# Install dependencies
npm run install-all
```

### Configuration

1. Create a `.env` file based on the provided `.env.example`


```bash
cp .env.example .env
```

2. Update the environment variables in `.env`


```
CHATBOT_SERVER_URL=http://your-chatbot-server:port
USER_UUID=your-user-uuid
AUTHORIZATION_TOKEN=your-authorization-token
```

## 📝 Running Tests

### Basic Test Execution

```bash
npm run test:botium
```

### Parallel Test Execution (Faster)

```bash
npm run test:botium:parallel
```


### 🧪 Test Structure

Tests are written in Botium's conversation format (`.convo.txt`) located in the convo directory:

```
#me
Hello

#bot
COSINE_SIMILARITY Hello there, how can I assist you today with your orders?
```

## 🛠️ Advanced Configuration

The project uses `botium.json` for configuration:

- **Timeout**: 60 seconds for API responses
- **Semantic Comparison**: Cosine similarity with 0.8 threshold
- **Headers**: Authorization and session management automatically handled


## 📁 Project Structure

```
├── asserters/             # Custom assertion logic
├── hooks/                 # Test lifecycle hooks
├── spec/convo/            # Test conversation files
├── botium.json            # Botium configuration
├── .env                   # Environment variables (private)
└── package.json           # Project dependencies and scripts
```


## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.