# Rusty Butter Dashboard

## Quick Start

1. **Access the dashboard:**
   - Open your browser and go to: http://localhost:8080/simple-dashboard.html

2. **Features:**
   - **Priority Chat**: Send messages with normal, high, or critical priority
   - **System Status**: View orchestrator status, active Claudes, and monitor connections
   - **Event Monitor**: Watch real-time events from all sources
   - **Queue Status**: Monitor action and performance queue sizes

## Priority Levels

- **Critical**: For urgent issues requiring immediate attention
- **High**: For important messages (default for CodingButter)
- **Normal**: For standard communication

## Dashboard Server

The dashboard server runs on port 3458 and provides WebSocket connectivity for real-time updates.

## Notes

- Messages from the dashboard with priority "critical" or "high" get processed faster
- All dashboard messages from CodingButter get special priority handling
- The dashboard auto-refreshes queue status every 5 seconds