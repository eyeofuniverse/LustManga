#!/usr/bin/env python3
"""
Reports this server's health to the LustPages admin console (Servers screen), once a minute from a systemd timer.

What it sends: processor, memory, swap and disk use, uptime and load; every docker container's state, health, restarts,
memory and processor; for each project that runs here, a direct request to the app (through the local web proxy, so
Cloudflare is not in the way) with its status and time; and, on the server that runs Coolify, the last deployments of every
project. Nothing else leaves the server, and no secret is ever included.

Configuration is /etc/lp-agent.env (root only), one KEY=VALUE per line:
  AGENT_SERVER      LP-Group or CKFood (the name the console knows the server by)
  AGENT_TARGET      where to post, e.g. http://127.0.0.1:80 or http://10.10.0.3:80 (the web proxy of the server that runs LustPages)
  AGENT_TARGET_HOST the Host header for that post (lustpages.com)
  VPS_AGENT_SECRET  the shared secret (the same value is VPS_AGENT_SECRET of the LustPages app)
  COOLIFY_URL       optional, http://127.0.0.1:8000 on the server that runs Coolify
  COOLIFY_TOKEN     optional, a read-only Coolify API token

`vps-agent.py --print` prints the report instead of sending it.
"""
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

PROJECTS = [
    # name, Coolify application uuid, host name the web proxy routes by, public address
    ("lustpages", "rwzwljn9bye51sea4a6j6xuv", "lustpages.com", "https://lustpages.com"),
    ("lusthentai", "0labzdf46jvf8mfrh29lmr2r", "lusthentai.com", "https://lusthentai.com"),
    ("bizcase", "sns5cllxkauzs3nu7kdqdevw", "os.ckfportugal.com", "https://os.ckfportugal.com"),
    ("ckfood-balance", "4nxm7fcaroylp5kcbfcsosyu", "balance.ckfportugal.com", "https://balance.ckfportugal.com"),
    ("bizcase-doc", "lxekivkrtgm0ylhvafbs60ab", "docs.ckfportugal.com", "https://docs.ckfportugal.com"),
]


def load_config(path="/etc/lp-agent.env"):
    cfg = dict(os.environ)
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return cfg


def run(cmd, timeout=25):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def cpu_times():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + (parts[4] if len(parts) > 4 else 0)  # idle + iowait
    return sum(parts), idle


def host_stats():
    t1, i1 = cpu_times()
    time.sleep(1)
    t2, i2 = cpu_times()
    busy = 100.0 * (1 - (i2 - i1) / (t2 - t1)) if t2 > t1 else 0.0
    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            mem[k] = int(v.split()[0]) * 1024
    st = os.statvfs("/")
    with open("/proc/uptime") as f:
        up = float(f.read().split()[0])
    return {
        "uptimeSec": int(up),
        "cpus": os.cpu_count() or 1,
        "cpuPct": round(max(0.0, min(100.0, busy)), 1),
        "load": [round(x, 2) for x in os.getloadavg()],
        "memTotal": mem.get("MemTotal", 0),
        "memUsed": mem.get("MemTotal", 0) - mem.get("MemAvailable", 0),
        "swapTotal": mem.get("SwapTotal", 0),
        "swapUsed": mem.get("SwapTotal", 0) - mem.get("SwapFree", 0),
        "diskTotal": st.f_blocks * st.f_frsize,
        "diskUsed": (st.f_blocks - st.f_bfree) * st.f_frsize,
    }


UNITS = {"b": 1, "kib": 1024, "mib": 1024**2, "gib": 1024**3, "tib": 1024**4, "kb": 1000, "mb": 1000**2, "gb": 1000**3}


def parse_bytes(text):
    m = re.match(r"\s*([\d.]+)\s*([A-Za-z]+)", text or "")
    return int(float(m.group(1)) * UNITS.get(m.group(2).lower(), 1)) if m else None


def containers():
    names = run(["docker", "ps", "-a", "--format", "{{.Names}}"]).split()
    if not names:
        return []
    info = {}
    try:
        for c in json.loads(run(["docker", "inspect"] + names) or "[]"):
            state = c.get("State", {})
            info[c["Name"].lstrip("/")] = {
                "name": c["Name"].lstrip("/"),
                "state": state.get("Status", "unknown"),
                "health": (state.get("Health") or {}).get("Status"),
                "startedAt": state.get("StartedAt") if state.get("Running") else None,
                "restarts": c.get("RestartCount", 0),
                "cpuPct": None,
                "mem": None,
            }
    except Exception:
        return []
    for line in run(["docker", "stats", "--no-stream", "--format", "{{json .}}"]).splitlines():
        try:
            s = json.loads(line)
            c = info.get(s["Name"])
            if c:
                c["cpuPct"] = float(s["CPUPerc"].rstrip("%"))
                c["mem"] = parse_bytes(s["MemUsage"].split("/")[0])
        except Exception:
            pass
    return list(info.values())


def pick_container(all_containers, uuid):
    """a project's container is named <uuid>-<timestamp>; during a deploy two exist, so take the newest running one"""
    mine = [c for c in all_containers if c["name"].startswith(uuid)]
    running = sorted((c for c in mine if c["state"] == "running"), key=lambda c: c["startedAt"] or "", reverse=True)
    return (running or sorted(mine, key=lambda c: c["name"], reverse=True) or [None])[0]


def probe(host):
    t = time.time()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", 80, timeout=20)
        conn.request("GET", "/", headers={"Host": host, "User-Agent": "lp-agent/1", "Cookie": "lm_age=1"})
        status = conn.getresponse().status
        conn.close()
    except Exception:
        status = 0
    return {"status": status, "ms": int((time.time() - t) * 1000)}


def coolify_deployments(cfg, uuid):
    req = urllib.request.Request(
        f"{cfg['COOLIFY_URL']}/api/v1/deployments/applications/{uuid}?skip=0&take=6",
        headers={"Authorization": f"Bearer {cfg['COOLIFY_TOKEN']}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.load(r)
    except Exception:
        return []
    out = []
    for d in data.get("deployments", []):
        out.append(
            {
                "id": d.get("deployment_uuid"),
                "status": d.get("status"),
                "commit": d.get("commit") or "",
                "message": d.get("commit_message") or "",
                "createdAt": d.get("created_at"),
                "finishedAt": d.get("finished_at") if d.get("status") not in ("queued", "in_progress") else None,
            }
        )
    return out


def build_report(cfg):
    allc = containers()
    projects = []
    for name, uuid, host, url in PROJECTS:
        c = pick_container(allc, uuid)
        project = {"name": name, "url": url, "container": c, "probe": probe(host) if c else None, "deployments": []}
        if cfg.get("COOLIFY_URL") and cfg.get("COOLIFY_TOKEN"):
            project["deployments"] = coolify_deployments(cfg, uuid)
        if c or project["deployments"]:
            projects.append(project)
    return {"server": cfg["AGENT_SERVER"], "host": host_stats(), "containers": allc, "projects": projects}


def send(cfg, report):
    req = urllib.request.Request(
        cfg["AGENT_TARGET"].rstrip("/") + "/api/internal/vps",
        data=json.dumps(report).encode(),
        method="POST",
        headers={
            "Host": cfg.get("AGENT_TARGET_HOST", "lustpages.com"),
            "Authorization": "Bearer " + cfg["VPS_AGENT_SECRET"],
            "Content-Type": "application/json",
            "User-Agent": "lp-agent/1",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.status


def main():
    cfg = load_config()
    report = build_report(cfg)
    if "--print" in sys.argv:
        print(json.dumps(report, indent=1))
        return 0
    try:
        status = send(cfg, report)
    except Exception as e:  # the timer simply tries again next minute
        print("send failed:", type(e).__name__, getattr(e, "code", ""), file=sys.stderr)
        return 1
    return 0 if status in (200, 204) else 1


if __name__ == "__main__":
    sys.exit(main())
