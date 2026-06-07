#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.request


def parse_args():
    parser = argparse.ArgumentParser(
        description="Migrate project Flow-backed blocks to canonical FlowScript .block.js through the Flow MCP endpoint."
    )
    parser.add_argument("--endpoint", default="http://localhost:18080/convertigo/api/flow-mcp",
                        help="Flow MCP HTTP endpoint.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--project", help="Convertigo project name resolved by the running engine.")
    target.add_argument("--project-dir", help="Direct project directory, mainly for standalone tests.")
    parser.add_argument("--name", action="append", default=[],
                        help="Block id to migrate. Can be repeated. When omitted, all project Flow blocks are considered.")
    parser.add_argument("--namespace", default="", help="Optional namespace filter when listing blocks.")
    parser.add_argument("--write", action="store_true", help="Write .block.js files. Default validates only.")
    parser.add_argument("--limit", type=int, default=100, help="Page size for block listing.")
    parser.add_argument("--json", action="store_true", help="Emit a JSON summary instead of human lines.")
    return parser.parse_args()


class McpClient:
    def __init__(self, endpoint):
        self.endpoint = endpoint
        self.next_id = 1

    def call_tool(self, name, arguments):
        payload = {
            "jsonrpc": "2.0",
            "id": self.next_id,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments
            }
        }
        self.next_id += 1
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                decoded = json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Cannot call Flow MCP endpoint {self.endpoint}: {exc}") from exc
        if decoded.get("error"):
            raise RuntimeError(json.dumps(decoded["error"], sort_keys=True))
        result = decoded.get("result") or {}
        structured = result.get("structuredContent")
        if structured is None:
            raise RuntimeError(f"Tool {name} returned no structuredContent")
        return structured


def target_args(args):
    out = {}
    if args.project:
        out["project"] = args.project
    if args.project_dir:
        out["projectDir"] = args.project_dir
    return out


def list_project_flow_blocks(client, args):
    blocks = []
    cursor = None
    base = target_args(args)
    while True:
        request = dict(base)
        request.update({
            "includePrivate": True,
            "detail": "compact",
            "origin": "project",
            "limit": args.limit,
            "doc": False,
            "hints": False
        })
        if args.namespace:
            request["namespace"] = args.namespace
        if cursor:
            request["cursor"] = cursor
        page = client.call_tool("flow-block-list", request)
        for block in page.get("blocks") or []:
            if block.get("implementation") == "flow":
                blocks.append(block.get("blockId"))
        cursor = page.get("nextCursor")
        if not cursor:
            break
    return [block for block in blocks if block]


def migrate_one(client, args, name):
    base = target_args(args)
    get_request = dict(base)
    get_request.update({"name": name, "includeSources": False})
    got = client.call_tool("flow-block-code-get", get_request)
    item = {
        "name": name,
        "status": "unknown",
        "canonical": bool(got.get("canonical")),
        "format": got.get("format", ""),
        "revision": got.get("revision", "")
    }
    if not got.get("ok", False):
        item.update({"status": "error", "error": got.get("error"), "diagnostics": got.get("diagnostics")})
        return item
    if got.get("canonical") is True:
        item["status"] = "skip-canonical"
        return item
    code = got.get("code") or ""
    if not code.strip():
        item.update({"status": "error", "error": {"message": "No FlowScript code returned"}})
        return item
    dry_request = dict(base)
    dry_request.update({"name": name, "code": code, "dry": True})
    dry = client.call_tool("flow-block-code-set", dry_request)
    if not dry.get("ok", False):
        item.update({"status": "invalid", "error": dry.get("error"), "diagnostics": dry.get("diagnostics")})
        return item
    item["validatedRevision"] = dry.get("revision", "")
    if not args.write:
        item["status"] = "validated"
        return item
    write_request = dict(base)
    write_request.update({"name": name, "code": code, "dry": False, "overwrite": True})
    written = client.call_tool("flow-block-code-set", write_request)
    if not written.get("ok", False):
        item.update({"status": "write-error", "error": written.get("error")})
        return item
    item.update({
        "status": "migrated",
        "revision": written.get("revision", item.get("revision", "")),
        "file": written.get("file", "")
    })
    return item


def main():
    args = parse_args()
    client = McpClient(args.endpoint)
    names = args.name or list_project_flow_blocks(client, args)
    results = [migrate_one(client, args, name) for name in names]
    summary = {
        "write": args.write,
        "total": len(results),
        "validated": sum(1 for item in results if item["status"] == "validated"),
        "migrated": sum(1 for item in results if item["status"] == "migrated"),
        "skipped": sum(1 for item in results if item["status"] == "skip-canonical"),
        "failed": sum(1 for item in results if item["status"] not in ("validated", "migrated", "skip-canonical")),
        "results": results
    }
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        action = "write" if args.write else "dry-run"
        print(f"mode: {action}")
        for item in results:
            line = f"{item['status']}: {item['name']}"
            if item.get("format"):
                line += f" ({item['format']})"
            if item.get("file"):
                line += f" -> {item['file']}"
            if item.get("error"):
                line += f" error={json.dumps(item['error'], sort_keys=True)}"
            print(line)
        print("summary: {total} total, {validated} validated, {migrated} migrated, {skipped} skipped, {failed} failed".format(**summary))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
