'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Home, Brain, Activity, Settings, GitBranch, Users } from 'lucide-react'
import rustyButterIcon from '@/assets/rusty-butter-icon.png'

export default function Navigation() {
  const pathname = usePathname()
  
  const links = [
    { href: '/', label: 'Overview', icon: Home },
    { href: '/activity', label: 'Activity', icon: Activity },
    { href: '/memory', label: 'Memory', icon: Brain },
    { href: '/settings', label: 'Settings', icon: Settings }
  ]
  
  return (
    <header className="bg-[#24292f] border-b border-[#30363d]">
      <div className="px-4 mx-auto">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Main Navigation */}
          <div className="flex items-center">
            <div className="flex items-center gap-2 mr-6">
              <Image 
                src={rustyButterIcon} 
                alt="Rusty Butter" 
                width={24} 
                height={24} 
                className="rounded"
              />
              <span className="text-[15px] font-semibold text-white">RustyButter</span>
            </div>
            
            <nav className="flex items-center space-x-0">
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-4 py-2 text-[14px] font-medium transition-colors border-b-2 ${
                    pathname === href 
                      ? 'text-white border-[#fd7e14]' 
                      : 'text-[#7d8590] hover:text-white border-transparent hover:border-[#6e7681]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>
          
          {/* Right side - Status and User */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[13px] text-[#7d8590]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-[#238636] rounded-full"></div>
                <span>System Online</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-[13px] text-[#7d8590]">
              <Users className="h-4 w-4" />
              <span>Multi-Agent</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}