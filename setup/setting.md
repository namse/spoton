1. script setting

save `ssh_idle_shutdown.sh` to `/usr/local/bin/ssh_idle_shutdown.sh`

2. chmod

```bash
sudo chmod +x /usr/local/bin/ssh_idle_shutdown.sh
```

3. crontab setting

```bash
echo "*/3 * * * * /usr/local/bin/ssh_idle_shutdown.sh" | sudo crontab -
```
