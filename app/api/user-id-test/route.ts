import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId } = body;
    
    console.log("User ID Test API called");
    console.log("Received user ID:", userId);
    
    return NextResponse.json({ 
      success: true, 
      message: "User ID received successfully", 
      receivedUserId: userId 
    });
  } catch (error) {
    console.error("Error in user ID test route:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 