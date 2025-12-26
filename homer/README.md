# Homer - Home Dashboard

A beautiful static dashboard for your home server services.

## Features

- 🎨 **Customizable** - YAML-based configuration
- 🌙 **Dark Mode** - Automatic theme switching
- 🔗 **Service Links** - Quick access to all your apps
- ✅ **Connectivity Check** - Shows service status

## Quick Start

```bash
cp .env.example .env
docker compose up -d
```

## Access

- **URL**: `https://solork.dev` (root domain)

## Configuration

Edit `config/config.yml` to customize:
- Service links and categories
- Colors and theme
- Header/footer
- Icons (uses Font Awesome)

### Adding a new service

```yaml
services:
  - name: "Category Name"
    icon: "fas fa-icon"
    items:
      - name: "Service Name"
        subtitle: "Description"
        logo: "https://example.com/logo.png"
        url: "https://service.yourdomain.com"
```

### Custom Logo

Place a `logo.png` file in the `config/` directory.

## Icons

- Dashboard icons: [walkxcode/dashboard-icons](https://github.com/walkxcode/dashboard-icons)
- Font Awesome: [fontawesome.com/icons](https://fontawesome.com/icons)

## Links

- [Homer GitHub](https://github.com/bastienwirtz/homer)
- [Homer Demo](https://homer-demo.netlify.app/)
