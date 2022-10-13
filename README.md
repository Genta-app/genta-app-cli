Genta.app CLI: Genta.app's official CLI tools.

# Install

```
git clone https://github.com/Genta-app/genta-app-cli.git
cd genta-app-cli
npm install -g .
```

# Configuration

An optional configuration file `~/.genta-app-cli` can be created to store authentication credentials.
From Bash command line:

```
echo '{"auth": {"email": "your-email@example.com", "password": "secret"}}' > ~/.genta-app-cli
```

# Commands

## Get help

```
genta --help
```

## Download

The `download` command downloads all files (images, video, text) from the specified album, decrypts
them and stores into a local directory.

Existing files are never overwritten so the same command can be used repeatedly to synchronize
a local copy of the album.

Output directory will be created if it doesn't exist.

```
genta download --album <album-name> --output-dir <output-path>
```

# Uninstall

```
cd genta-app-cli
npm uninstall -g genta-app-cli
```

