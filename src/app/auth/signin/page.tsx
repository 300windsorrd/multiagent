"use client"

import { signIn, getProviders } from "next-auth/react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Calendar, FileText, Users, MessageSquare, GamepadIcon } from "lucide-react"

interface Provider {
  id: string
  name: string
  type: string
  signinUrl: string
  callbackUrl: string
}

const providerIcons = {
  google: <Mail className="w-5 h-5" />,
  microsoft: <Mail className="w-5 h-5" />,
  github: <FileText className="w-5 h-5" />,
  slack: <MessageSquare className="w-5 h-5" />,
  discord: <GamepadIcon className="w-5 h-5" />,
}

const providerScopes = {
  google: ["Gmail", "Calendar", "Drive"],
  microsoft: ["Email", "Calendar", "Files"],
  github: ["Repositories", "Organizations"],
  slack: ["Channels", "Messages", "Users"],
  discord: ["Servers", "Channels"],
}

const providerDescriptions = {
  google: "Connect your Google Workspace account for email, calendar, and file access",
  microsoft: "Connect your Microsoft Outlook account for email and calendar access",
  github: "Connect your GitHub account for development workflows and repository access",
  slack: "Connect your Slack workspace for notifications and team communication",
  discord: "Connect your Discord account for community management and notifications",
}

export default function SignIn() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null)

  useEffect(() => {
    const getAuthProviders = async () => {
      const providers = await getProviders()
      setProviders(providers)
    }
    getAuthProviders()
  }, [])

  const handleSignIn = (providerId: string) => {
    signIn(providerId, { callbackUrl: "/" })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-4xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to BuilderAgent
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Connect your accounts to enable powerful AI automation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers &&
            Object.values(providers).map((provider) => (
              <Card key={provider.name} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {providerIcons[provider.id as keyof typeof providerIcons] || (
                        <Mail className="w-5 h-5" />
                      )}
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {providerDescriptions[provider.id as keyof typeof providerDescriptions] ||
                      `Connect your ${provider.name} account`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Available Services:</span>
                    <div className="flex flex-wrap gap-1">
                      {providerScopes[provider.id as keyof typeof providerScopes]?.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSignIn(provider.id)}
                    className="w-full"
                    size="sm"
                  >
                    Connect {provider.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>

        <div className="mt-8 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Secure OAuth 2.0 Authentication
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                All connections use industry-standard OAuth 2.0 with minimal required scopes. 
                Your data is processed locally and never shared with third parties.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}