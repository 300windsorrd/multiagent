import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user by email
    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const connections = await db.serviceConnection.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ connections })
  } catch (error) {
    console.error("Error fetching service connections:", error)
    return NextResponse.json(
      { error: "Failed to fetch service connections" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user by email
    const user = await db.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { name, type, config, metadata } = await request.json()

    const connection = await db.serviceConnection.create({
      data: {
        userId: user.id,
        name,
        type,
        config,
        metadata,
      },
    })

    return NextResponse.json({ connection })
  } catch (error) {
    console.error("Error creating service connection:", error)
    return NextResponse.json(
      { error: "Failed to create service connection" },
      { status: 500 }
    )
  }
}