# Home Assistant

Home automation platform with MQTT and Zigbee support.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Home Assistant** | 8123 | Main automation platform |
| **Mosquitto** | 1883 | MQTT broker |
| **Zigbee2MQTT** | 8082 | Zigbee device management |

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 2. Start Services

```bash
# Start without Zigbee2MQTT first (unless you have a Zigbee adapter)
docker compose up -d homeassistant mosquitto
```

### 3. Initial Home Assistant Setup

1. Go to `http://YOUR_IP:8123`
2. Create your account
3. Set up your home location and units
4. Discover devices on your network

## MQTT Setup

### Configure Mosquitto

Create config file:

```bash
docker exec -it mosquitto sh -c 'cat > /mosquitto/config/mosquitto.conf << EOF
listener 1883
allow_anonymous false
password_file /mosquitto/config/password.txt
EOF'

# Create user
docker exec -it mosquitto mosquitto_passwd -c /mosquitto/config/password.txt homeassistant

# Restart
docker compose restart mosquitto
```

### Add MQTT to Home Assistant

1. Go to Settings > Devices & Services
2. Add Integration > MQTT
3. Configure:
   - Broker: `mosquitto`
   - Port: `1883`
   - Username/Password: as created above

## Zigbee Setup (Optional)

Requires a Zigbee USB adapter (e.g., Sonoff Zigbee 3.0, ConBee II).

### 1. Find Your Adapter

```bash
ls -la /dev/ttyUSB* /dev/ttyACM*
```

### 2. Update docker-compose.yml

Uncomment the `devices` section and set your adapter path.

### 3. Configure Zigbee2MQTT

Create initial config:

```bash
docker exec -it zigbee2mqtt sh -c 'cat > /app/data/configuration.yaml << EOF
homeassistant: true
permit_join: false
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://mosquitto:1883
  user: homeassistant
  password: YOUR_MQTT_PASSWORD
serial:
  port: /dev/ttyACM0
frontend:
  port: 8080
EOF'
```

### 4. Start Zigbee2MQTT

```bash
docker compose up -d zigbee2mqtt
```

## Integrations to Consider

- **Google Home / Alexa** - Voice control
- **Spotify** - Media control
- **Philips Hue** - Smart lights
- **Tuya** - Smart devices
- **ESPHome** - DIY sensors

## Automations Examples

### Motion-activated lights
```yaml
automation:
  - alias: "Motion Light"
    trigger:
      - platform: state
        entity_id: binary_sensor.motion
        to: "on"
    action:
      - service: light.turn_on
        target:
          entity_id: light.living_room
```

### Notify on door open
```yaml
automation:
  - alias: "Door Alert"
    trigger:
      - platform: state
        entity_id: binary_sensor.front_door
        to: "on"
    action:
      - service: notify.mobile_app
        data:
          message: "Front door opened!"
```

## Useful Commands

```bash
# View logs
docker compose logs -f homeassistant

# Restart Home Assistant
docker compose restart homeassistant

# Check config
docker exec homeassistant python -m homeassistant --script check_config -c /config
```

## Backup

```bash
# Backup config
docker cp homeassistant:/config ./backup/homeassistant-$(date +%Y%m%d)
```

## Mobile App

Install **Home Assistant** app:
- iOS: App Store
- Android: Play Store

Connect using your server URL or Nabu Casa for remote access.
