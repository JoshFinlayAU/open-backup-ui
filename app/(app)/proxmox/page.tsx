"use client"

import { useEffect, useState } from "react"
import { Shield, CalendarClock, CheckCircle2, XCircle, Loader2, Clock, HardDrive, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProxmoxBackupJob, ProxmoxTask, ProxmoxBackupSummary } from "@/lib/types/proxmox"

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

function formatCron(job: ProxmoxBackupJob): string {
    if (job.schedule) return job.schedule
    if (job.starttime && job.dow) return `${job.starttime} on ${job.dow}`
    if (job.starttime) return `Daily at ${job.starttime}`
    return "—"
}

function buildSummary(jobs: ProxmoxBackupJob[], tasks: ProxmoxTask[]): ProxmoxBackupSummary {
    const now = Math.floor(Date.now() / 1000)
    const cutoff = now - 86400
    const recent = tasks.filter(t => t.starttime >= cutoff)
    return {
        jobCount: jobs.length,
        enabledJobCount: jobs.filter(j => j.enabled !== 0).length,
        last24hSuccess: recent.filter(t => t.exitstatus === 'OK').length,
        last24hFailed: recent.filter(t => t.exitstatus && t.exitstatus !== 'OK').length,
        last24hRunning: recent.filter(t => !t.exitstatus).length,
        totalBackupStorageUsed: 0,
    }
}

export default function ProxmoxPage() {
    const [jobs, setJobs] = useState<ProxmoxBackupJob[]>([])
    const [tasks, setTasks] = useState<ProxmoxTask[]>([])
    const [summary, setSummary] = useState<ProxmoxBackupSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [jobsRes, tasksRes] = await Promise.all([
                    fetch("/api/proxmox/backup-jobs"),
                    fetch("/api/proxmox/backup-tasks")
                ])

                if (!jobsRes.ok || !tasksRes.ok) {
                    throw new Error("Failed to fetch Proxmox backup data")
                }

                const [jobsData, tasksData] = await Promise.all([
                    jobsRes.json(),
                    tasksRes.json()
                ])

                const jobList: ProxmoxBackupJob[] = jobsData?.data ?? []
                const taskList: ProxmoxTask[] = tasksData?.data ?? []
                setJobs(jobList)
                setTasks(taskList)
                setSummary(buildSummary(jobList, taskList))
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
                    <h1 className="text-3xl font-bold tracking-tight">Proxmox VE Backups</h1>
                    <p className="text-muted-foreground mt-1">Backup jobs and task history</p>
                </div>

                {/* Summary Cards */}
                {summary && (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Backup Jobs</CardTitle>
                                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.enabledJobCount}/{summary.jobCount}</div>
                                <p className="text-xs text-muted-foreground">enabled</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Successful (24h)</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-500">{summary.last24hSuccess}</div>
                                <p className="text-xs text-muted-foreground">backup tasks</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-destructive">{summary.last24hFailed}</div>
                                <p className="text-xs text-muted-foreground">backup tasks</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Running</CardTitle>
                                <HardDrive className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{summary.last24hRunning}</div>
                                <p className="text-xs text-muted-foreground">in progress</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Backup Jobs Table */}
                {jobs.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Scheduled Backup Jobs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Schedule</TableHead>
                                        <TableHead>VMs / Pools</TableHead>
                                        <TableHead>Storage</TableHead>
                                        <TableHead>Compression</TableHead>
                                        <TableHead>Next Run</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobs.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell className="font-mono text-sm">{job.id}</TableCell>
                                            <TableCell>
                                                {job.enabled === 0 ? (
                                                    <Badge variant="secondary" className="text-xs">Disabled</Badge>
                                                ) : (
                                                    <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 text-xs">
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                        Enabled
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{formatCron(job)}</TableCell>
                                            <TableCell>
                                                {job.vmid ? (
                                                    <span className="text-sm">{job.vmid}</span>
                                                ) : job.pool ? (
                                                    <Badge variant="outline" className="text-xs">Pool: {job.pool}</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">All VMs</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm">{job.storage ?? "—"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {job.compress ?? "none"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {job['next-run'] ? (
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {formatTimestamp(job['next-run'])}
                                                    </div>
                                                ) : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {jobs.length === 0 && !loading && (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                            <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
                            <p className="font-medium">No scheduled backup jobs found</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Configure backup jobs in the Proxmox VE web interface under Datacenter → Backup.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Recent Backup Tasks Table */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Recent Backup Tasks
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {tasks.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                No recent backup tasks found.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>VM / CT</TableHead>
                                        <TableHead>Node</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Start Time</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tasks.slice(0, 30).map((task) => (
                                        <TableRow key={task.upid}>
                                            <TableCell className="font-mono text-sm">{task.id ?? "—"}</TableCell>
                                            <TableCell>{task.node}</TableCell>
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
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}


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
