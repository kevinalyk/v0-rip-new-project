"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Loader2, Search, RefreshCw, UserPlus, MoreHorizontal, Edit, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

function getRoleDisplay(role: string) {
  if (role === "super_admin") return "Super Admin"
  return role
}

export default function AccountUsersPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [isLoading, setIsLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString())
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", email: "", role: "user" })
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [editRoleUserId, setEditRoleUserId] = useState<string | null>(null)
  const [editRoleValue, setEditRoleValue] = useState<string>("")
  const [updatingRole, setUpdatingRole] = useState(false)
  const [forceResetUserId, setForceResetUserId] = useState<string | null>(null)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [resetPasswordResult, setResetPasswordResult] = useState<{ tempPassword: string; email: string } | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()
        setCurrentUser(user)

        if (user.firstLogin) {
          router.push("/reset-password")
          return
        }

        if (clientSlug === "admin") {
          if (user.role !== "super_admin") {
            router.push(`/${user.clientSlug}`)
            return
          }
        } else {
          const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
            credentials: "include",
          })

          if (!verifyResponse.ok) {
            if (user.role === "super_admin") {
              router.push("/rip/ci/campaigns")
            } else {
              router.push(`/${user.clientSlug}`)
            }
            return
          }
        }

        setIsLoading(false)
      } catch (error) {
        console.error("Auth check failed:", error)
        router.push("/login")
      }
    }

    checkAuth()
  }, [router, clientSlug])

  useEffect(() => {
    if (!isLoading) {
      fetchUsers()
    }
  }, [isLoading])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }
      const url = `/api/users${params.toString() ? `?${params.toString()}` : ""}`

      const response = await fetch(url, {
        credentials: "include",
      })

      if (response.status === 403) {
        console.log("User does not have permission to view users list")
        setUsers([])
        return
      }

      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }

      const data = await response.json()
      setUsers(data)
      setLastUpdated(new Date().toLocaleString())
    } catch (error) {
      console.error("Error fetching users:", error)
      toast.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.firstName.trim() || !newUser.email.trim()) {
      toast.error("Please fill in required fields")
      return
    }

    try {
      setAddingUser(true)
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...newUser,
          clientSlug: clientSlug,
        }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation")
      }

      setUsers((prev) => [...prev, data.user])
      setNewUser({ firstName: "", lastName: "", email: "", role: "user" })
      setIsAddUserOpen(false)
      toast.success("Invitation sent successfully")
    } catch (error: any) {
      console.error("Error sending invitation:", error)
      toast.error(error.message || "Failed to send invitation")
    } finally {
      setAddingUser(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    try {
      setDeletingId(id)
      const response = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to delete user")
      }

      setUsers((prev) => prev.filter((user) => user.id !== id))
      toast.success("User deleted successfully")
    } catch (error) {
      console.error("Error deleting user:", error)
      toast.error("Failed to delete user")
    } finally {
      setDeletingId(null)
    }
  }

  const handleResendInvite = async (userId: string) => {
    try {
      setResendingId(userId)
      const response = await fetch("/api/users/resend-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIdToResend: userId }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend invitation")
      }

      toast.success("Invitation resent successfully")
    } catch (error: any) {
      console.error("Error resending invitation:", error)
      toast.error(error.message || "Failed to resend invitation")
    } finally {
      setResendingId(null)
    }
  }

  const handleUpdateRole = async () => {
    if (!editRoleUserId) return

    try {
      setUpdatingRole(true)
      const response = await fetch(`/api/users/${editRoleUserId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: editRoleValue }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to update user role")
      }

      setUsers((prev) => prev.map((user) => (user.id === editRoleUserId ? { ...user, role: editRoleValue } : user)))
      setEditRoleUserId(null)
      setEditRoleValue("")
      toast.success("User role updated successfully")
    } catch (error) {
      console.error("Error updating user role:", error)
      toast.error("Failed to update user role")
    } finally {
      setUpdatingRole(false)
    }
  }

  const handleForceResetPassword = async (userId: string, userEmail: string) => {
    try {
      setResettingPassword(true)
      const response = await fetch(`/api/users/${userId}/force-reset-password`, {
        method: "POST",
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password")
      }

      setResetPasswordResult({
        tempPassword: data.temporaryPassword,
        email: data.email,
      })
      setForceResetUserId(null)
      fetchUsers()
      toast.success(`Password reset successfully. Temporary password: ${data.temporaryPassword}`)
    } catch (error: any) {
      console.error("Error resetting password:", error)
      toast.error(error.message || "Failed to reset password")
    } finally {
      setResettingPassword(false)
    }
  }

  const refreshList = () => {
    fetchUsers()
  }

  const filteredUsers = users.filter(
    (user) =>
      (user.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rip-red" />
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Users</h2>
              <p className="text-sm text-muted-foreground">Manage user accounts and permissions</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-transparent"
                onClick={refreshList}
              >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>

              <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="flex items-center gap-2 !bg-rip-red hover:!bg-rip-red/90 !text-white">
                    <UserPlus size={16} />
                    <span className="hidden sm:inline">Add User</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New User</DialogTitle>
                    <DialogDescription>Send an invitation to create a new user account.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">
                        First Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        value={newUser.firstName}
                        onChange={(e) => setNewUser((prev) => ({ ...prev, firstName: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        value={newUser.lastName}
                        onChange={(e) => setNewUser((prev) => ({ ...prev, lastName: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">
                        Email Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={newUser.email}
                        onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={newUser.role}
                        onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={addingUser}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddUser}
                      disabled={addingUser}
                      className="!bg-rip-red hover:!bg-rip-red/90 !text-white"
                    >
                      {addingUser ? (
                        <>
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Invite"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Last updated: <span className="font-medium">{lastUpdated}</span>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search users..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex justify-center">
                        <Loader2 size={24} className="animate-spin text-rip-red" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-rip-red/10 text-rip-red text-xs">
                              {user.firstName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                              {user.lastName?.[0]?.toUpperCase() || ""}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {user.firstName} {user.lastName}
                            </div>
                            {user.firstLogin === true && (
                              <div className="text-xs text-amber-600 dark:text-amber-400">Pending invitation</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" || user.role === "owner" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {getRoleDisplay(user.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(currentUser?.role === "super_admin" ||
                              currentUser?.role === "owner" ||
                              (currentUser?.role === "admin" &&
                                user.role !== "admin" &&
                                user.role !== "super_admin" &&
                                user.role !== "owner")) && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditRoleUserId(user.id)
                                  setEditRoleValue(user.role)
                                }}
                              >
                                <Edit size={14} className="mr-2" />
                                Edit Role
                              </DropdownMenuItem>
                            )}
                            {currentUser?.role === "super_admin" && currentUser?.id !== user.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-orange-600 focus:text-orange-600"
                                  >
                                    <RefreshCw size={14} className="mr-2" />
                                    Force Reset Password
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Force Reset Password?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will reset {user.firstName || user.email}&apos;s password to a temporary
                                      password (TempPassword{new Date().getFullYear()}!) and require them to change it
                                      on their next login.
                                      <br />
                                      <br />
                                      An email will be sent to <strong>{user.email}</strong> with the temporary
                                      password.
                                      <br />
                                      <br />
                                      <span className="text-orange-600 font-semibold">
                                        ⚠️ Warning: This will immediately invalidate their current password.
                                      </span>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleForceResetPassword(user.id, user.email)}
                                      className="bg-orange-600 hover:bg-orange-700"
                                      disabled={resettingPassword}
                                    >
                                      {resettingPassword ? (
                                        <>
                                          <Loader2 size={16} className="mr-2 animate-spin" />
                                          Resetting...
                                        </>
                                      ) : (
                                        "Reset Password"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {(currentUser?.role === "super_admin" ||
                              (currentUser?.role === "owner" && user.role !== "owner" && user.role !== "super_admin") ||
                              (currentUser?.role === "admin" &&
                                user.role !== "admin" &&
                                user.role !== "super_admin" &&
                                user.role !== "owner")) && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash size={14} className="mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the user account. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUser(user.id)}
                                      className="bg-destructive hover:bg-destructive/90"
                                      disabled={deletingId === user.id}
                                    >
                                      {deletingId === user.id ? (
                                        <>
                                          <Loader2 size={14} className="mr-2 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog open={editRoleUserId !== null} onOpenChange={(open) => !open && setEditRoleUserId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit User Role</DialogTitle>
                <DialogDescription>
                  Change the role for this user. Owners and admins have elevated permissions to manage users and
                  settings.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="editRole">Role</Label>
                  <Select value={editRoleValue} onValueChange={setEditRoleValue}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentUser?.role === "super_admin" && <SelectItem value="owner">Owner</SelectItem>}
                      {(currentUser?.role === "super_admin" || currentUser?.role === "owner") && (
                        <SelectItem value="admin">Admin</SelectItem>
                      )}
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditRoleUserId(null)} disabled={updatingRole}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateRole}
                  disabled={updatingRole}
                  className="!bg-rip-red hover:!bg-rip-red/90 !text-white"
                >
                  {updatingRole ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Role"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {resetPasswordResult && (
            <div className="fixed inset-0 flex items-center justify-center bg-black/50">
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <h2 className="text-lg font-medium mb-4">Temporary Password Sent</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  An email with the temporary password has been sent to <strong>{resetPasswordResult.email}</strong>.
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Temporary password: <strong>{resetPasswordResult.tempPassword}</strong>
                </p>
                <Button
                  onClick={() => setResetPasswordResult(null)}
                  className="bg-rip-red hover:bg-rip-red/90 text-white"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
