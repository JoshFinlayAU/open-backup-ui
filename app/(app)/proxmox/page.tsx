"use client"

import { useEffect, useState } from "react"
import { Server, Cpu, MemoryStick, Box, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProxmoxNode, ProxmoxVM, ProxmoxSummary } from "@/lib/types/proxmox"

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

export default function ProxmoxPage() {
    const [summary, setSummary] = useState<ProxmoxSummary | null>(null)
    const [nodes, setNodes] = useState<ProxmoxNode[]>([])
    const [vms, setVMs] = useState<ProxmoxVM[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [summaryRes, nodesRes, vmsRes] = await Promise.all([
                    fetch("/api/proxmox/summary"),
                    fetch("/api/proxmox/nodes"),
                    fetch("/api/proxmox/vms")
                ])

                if (!summaryRes.ok || !nodesRes.ok || !vmsRes.ok) {
                    throw new Error("Failed to fetch Proxmox data")
                }

                const [summaryData, nodesData, vmsData] = await Promise.all([
                    summaryRes.json(),
                    nodesRes.json(),
                    vmsRes.json()
                ])

                setSummary(summaryData)
                setNodes(nodesData?.data ?? [])
                setVMs(vmsData?.data ?? [])
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load data")
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex-1 overflow-auto">
                <div className="container mx-auto py-8 px-4">
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <XCircle className="h-12 w-12 text-destructive mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Connection Error</h1>
                        <p className="text-muted-foreground">{error}</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-auto">
            <div className="container mx-auto py-8 px-4 space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Proxmox VE</h1>
                    <p className="text-muted-foreground mt-1">Virtualization platform overview</p>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Nodes</CardTitle>
                                <Server className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.onlineNodes}/{summary.nodeCount}</div>
                                <p className="text-xs text-muted-foreground">online</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Virtual Machines</CardTitle>
                                <Box className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.runningVMs}/{summary.vmCount}</div>
                                <p className="text-xs text-muted-foreground">running</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Containers</CardTitle>
                                <Box className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.runningContainers}/{summary.containerCount}</div>
                                <p className="text-xs text-muted-foreground">running</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                                <Cpu className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatPercent(summary.cpuUsage)}</div>
                                <p className="text-xs text-muted-foreground">{summary.totalCPUs} total CPUs</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {summary && (
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
                            <MemoryStick className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatBytes(summary.usedMemory)} / {formatBytes(summary.totalMemory)}
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-secondary">
                                <div
                                    className="h-2 rounded-full bg-orange-500"
                                    style={{ width: `${summary.totalMemory > 0 ? (summary.usedMemory / summary.totalMemory) * 100 : 0}%` }}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Nodes Table */}
                {nodes.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Nodes</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Node</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>CPU Usage</TableHead>
                                        <TableHead>Memory</TableHead>
                                        <TableHead>Disk</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {nodes.map((node) => (
                                        <TableRow key={node.node}>
                                            <TableCell className="font-medium">{node.node}</TableCell>
                                            <TableCell>
                                                {node.status === 'online' ? (
                                                    <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                        Online
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="destructive">
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        Offline
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {node.cpu !== undefined ? formatPercent(node.cpu) : "—"}
                                                {node.maxcpu ? ` (${node.maxcpu} CPUs)` : ""}
                                            </TableCell>
                                            <TableCell>
                                                {node.mem && node.maxmem
                                                    ? `${formatBytes(node.mem)} / ${formatBytes(node.maxmem)}`
                                                    : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {node.disk && node.maxdisk
                                                    ? `${formatBytes(node.disk)} / ${formatBytes(node.maxdisk)}`
                                                    : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* VMs Table */}
                {vms.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Virtual Machines & Containers</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Node</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>CPU</TableHead>
                                        <TableHead>Memory</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {vms.slice(0, 50).map((vm) => (
                                        <TableRow key={`${vm.node}-${vm.vmid}`}>
                                            <TableCell className="font-mono text-sm">{vm.vmid}</TableCell>
                                            <TableCell className="font-medium">{vm.name ?? "—"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {vm.type === 'qemu' ? 'VM' : 'CT'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{vm.node}</TableCell>
                                            <TableCell>
                                                {vm.status === 'running' ? (
                                                    <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 text-xs">
                                                        Running
                                                    </Badge>
                                                ) : vm.status === 'stopped' ? (
                                                    <Badge variant="secondary" className="text-xs">Stopped</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">{vm.status}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {vm.cpu !== undefined ? formatPercent(vm.cpu) : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {vm.mem && vm.maxmem
                                                    ? `${formatBytes(vm.mem)} / ${formatBytes(vm.maxmem)}`
                                                    : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {nodes.length === 0 && vms.length === 0 && !loading && (
                    <div className="text-center py-12 text-muted-foreground">
                        No Proxmox data available. Ensure your Proxmox VE is connected and accessible.
                    </div>
                )}
            </div>
        </div>
    )
}
