#!/usr/bin/env bash
# Read-only resource check. Does not prune, install, stop services, or print credentials.
set -eu
printf '\n=== 文件系统与inode ===\n'; df -h /; df -i /
printf '\n=== 内存与交换空间 ===\n'; free -h; swapon --show || true
printf '\n=== Docker ===\n'
if command -v docker >/dev/null 2>&1; then
  docker version --format '{{.Server.Version}}' || true
  docker compose version || true
  docker system df || true
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' || true
fi
root=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)
[ -n "$root" ] && [ -d "$root" ] || root=/
free_kb=$(df -Pk "$root" | awk 'NR==2{print $4}')
avail_kb=$(awk '/MemAvailable:/{print $2}' /proc/meminfo)
printf '\nDocker所在分区剩余：%s KiB；当前可用内存：%s KiB。\n' "$free_kb" "$avail_kb"
if [ "$free_kb" -lt 10485760 ] || [ "$avail_kb" -lt 1572864 ]; then
  echo '暂不建议启动全部服务：剩余空间小于10GiB，或当前可用内存小于1.5GiB。先人工评估；不要自动删卷或停其他项目。'
  exit 2
fi
echo '达到小规模试运行的粗筛门槛，但不是容量保证。建议远程构建；观察启动、Codex执行和备份时的实际峰值。'
