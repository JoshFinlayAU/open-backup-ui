"use client"

import { useEffect, useState } from "react"
import { Database, HardDrive, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PBSDatastore, PBSTask, PBSSummary } from "@/lib/types/proxmox"

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatTimestamp(ts: number): string {
    if (!ts) return "—"
    return new Date(ts * 1000).toLocaleString()
}

function formatDuration(start: number, end?: number): string {
    if (!start) return "—"
    const endTs = end ?? Math.floor(Date.now() / 1000)
    const seconds = endTs - start
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export default function PBSPage() {
    const [summary, setSummary] = useState<PBSSummary | null>(null)
    const [datastores, setDatastores] = useState<PBSDatastore[]>([])
    const [tasks, setTasks] = useState<PBSTask[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [summaryRes, datastoresRes, tasksRes] = await Promise.all([
                    fetch("/api/pbs/summary"),
                    fetch("/api/pbs/datastores"),
                    fetch("/api/pbs/tasks")
                ])

                if (!summaryRes.ok || !datastoresRes.ok || !tasksRes.ok) {
                    throw new Error("Failed to fetch PBS data")
                }

                const [summaryData, datastoresData, tasksData] = await Promise.all([
                    summaryRes.json(),
                    datastoresRes.json(),
                    tasksRes.json()
                ])

                setSummary(summaryData)
                setDatastores(datastoresData?.data ?? [])
                setTasks(tasksData?.data ?? [])
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
                    <h1 className="text-3xl font-bold tracking-tight">Proxmox Backup Server</h1>
                    <p className="text-muted-foreground mt-1">Backup infrastructure and task overview</p>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Datastores</CardTitle>
                                <Database className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.datastoreCount}</div>
                                <p className="text-xs text-muted-foreground">configured</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Used Space</CardTitle>
                                <HardDrive className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatBytes(summary.usedSpace)}</div>
                                <p className="text-xs text-muted-foreground">of {formatBytes(summary.totalSpace)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Successful Tasks</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-500">{summary.successfulTasks}</div>
                                <p className="text-xs text-muted-foreground">recent</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Failed Tasks</CardTitle>
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-destructive">{summary.failedTasks}</div>
                                <p className="text-xs text-muted-foreground">recent</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Datastores Table */}
                {datastores.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Datastores</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Used</TableHead>
                                        <TableHead>Available</TableHead>
                                        <TableHead>Usage</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {datastores.map((ds) => {
                                        const usagePercent = ds.total && ds.total > 0
                                            ? ((ds.used ?? 0) / ds.total) * 100
                                            : 0
                                        return (
                                            <TableRow key={ds.name}>
                                                <TableCell className="font-medium">{ds.name}</TableCell>
                                                <TableCell>{ds.total ? formatBytes(ds.total) : "—"}</TableCell>
                                                <TableCell>{ds.used ? formatBytes(ds.used) : "—"}</TableCell>
                                                <TableCell>{ds.avail ? formatBytes(ds.avail) : "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-2 rounded-full bg-secondary">
                                                            <div
                                                                className={`h-2 rounded-full ${usagePercent > 85 ? 'bg-destructive' : usagePercent > 70 ? 'bg-amber-500' : 'bg-orange-500'}`}
                                                                style={{ width: `${usagePercent}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">
                                                            {usagePercent.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Tasks Table */}
                {tasks.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Tasks</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>ID</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Start Time</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tasks.slice(0, 30).map((task) => (
                                        <TableRow key={task.upid}>
                                            <TableCell className="font-medium">{task.type}</TableCell>
                                            <TableCell className="font-mono text-xs">{task.id ?? "—"}</TableCell>
                                            <TableCell>{task.user}</TableCell>
                                            <TableCell className="text-sm">
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                    {formatTimestamp(task.starttime)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {formatDuration(task.starttime, task.endtime)}
                                            </TableCell>
                                            <TableCell>
                                                {!task.exitstatus ? (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                        Running
                                                    </Badge>
                                                ) : task.exitstatus === 'OK' ? (
                                                    <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 text-xs">
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                        OK
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="destructive" className="text-xs">
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        {task.exitstatus}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {datastores.length === 0 && tasks.length === 0 && !loading && (
                    <div className="text-center py-12 text-muted-foreground">
                        No PBS data available. Ensure your Proxmox Backup Server is connected and accessible.
                    </div>
                )}
            </div>
        </div>
    )
}
