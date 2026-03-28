import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Trash2, Plus, Menu, X, MessageSquare, ChevronRight, LogOut, LogIn, Image as ImageIcon, Copy, RotateCcw, Mic, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { streamChatWithGemini, generateImageWithGemini, textToSpeech, Message } from './services/geminiService';
import { cn } from './lib/utils';
import { Volume2, Globe, Wand2, Activity } from 'lucide-react';

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

interface UserProfile {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ data: string, mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const fetchInitialData = async () => {
    setIsAuthLoading(true);
    try {
      const [userRes, chatsRes] = await Promise.all([
        fetch('/api/me'),
        fetch('/api/chats')
      ]);
      
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }
      
      if (chatsRes.ok) {
        const chatsData = await chatsRes.json();
        setChats(chatsData);
        if (chatsData.length > 0 && !activeChatId) {
          setActiveChatId(chatsData[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch initial data', e);
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchInitialData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const saveChatToServer = async (chat: Chat) => {
    if (!user) return;
    try {
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chat),
      });
    } catch (e) {
      console.error('Failed to save chat', e);
    }
  };

  const handleGenerateImage = async () => {
    if (!input.trim() || isLoading) return;
    
    const prompt = input;
    setInput('');
    setIsLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Görsel oluştur: ${prompt}`,
      timestamp: Date.now(),
    };

    setChats(prev => {
      const active = prev.find(c => c.id === activeChatId);
      if (active) {
        return prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, userMessage] } : c);
      }
      const newChat: Chat = {
        id: Date.now().toString(),
        title: prompt.slice(0, 30),
        messages: [userMessage],
        timestamp: Date.now(),
      };
      setActiveChatId(newChat.id);
      return [newChat, ...prev];
    });

    try {
      const imageUrl = await generateImageWithGemini(prompt);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `İşte senin için oluşturduğum görsel:`,
        timestamp: Date.now(),
        image: { data: imageUrl.split(',')[1], mimeType: 'image/png' }
      };

      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, assistantMessage] } : c));
      
      const currentChat = chats.find(c => c.id === activeChatId);
      if (currentChat) {
        saveChatToServer({ ...currentChat, messages: [...currentChat.messages, userMessage, assistantMessage] });
      }
    } catch (error) {
      console.error('Image generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAudio = async (text: string, messageId: string) => {
    if (isPlaying === messageId) {
      audioRef.current?.pause();
      setIsPlaying(null);
      return;
    }

    try {
      const audioUrl = await textToSpeech(text);
      if (audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
          setIsPlaying(messageId);
          audioRef.current.onended = () => setIsPlaying(null);
        } else {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.play();
          setIsPlaying(messageId);
          audio.onended = () => setIsPlaying(null);
        }
      }
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async () => {
    if (messages.length < 2 || isLoading) return;
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;
    
    // Remove last model message if it exists
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'model') {
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: c.messages.slice(0, -1) } : c));
    }
    
    setInput(lastUserMessage.content);
    handleSend();
  };

  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tarayıcınız ses tanıma özelliğini desteklemiyor.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'Yeni Sohbet',
      messages: [],
      timestamp: Date.now(),
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chats/${id}`, { method: 'DELETE' });
      const updatedChats = chats.filter(c => c.id !== id);
      setChats(updatedChats);
      if (activeChatId === id) {
        setActiveChatId(updatedChats.length > 0 ? updatedChats[0].id : null);
      }
    } catch (e) {
      console.error('Failed to delete chat', e);
    }
  };

  const handleLogin = () => {
    // No login needed
  };

  const handleLogout = async () => {
    // No logout needed in direct access mode
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setSelectedImage({
        data: base64String,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    let currentChatId = activeChatId;
    let currentChats = [...chats];

    if (!currentChatId) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: input ? (input.slice(0, 30) + (input.length > 30 ? '...' : '')) : 'Görsel Analizi',
        messages: [],
        timestamp: Date.now(),
      };
      currentChats = [newChat, ...currentChats];
      setChats(currentChats);
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      image: selectedImage || undefined
    };

    const updatedChatsWithUser = currentChats.map(chat => {
      if (chat.id === currentChatId) {
        const isFirstMessage = chat.messages.length === 0;
        const updatedChat = {
          ...chat,
          title: isFirstMessage ? (input ? (input.slice(0, 30) + (input.length > 30 ? '...' : '')) : 'Görsel Analizi') : chat.title,
          messages: [...chat.messages, userMessage],
          timestamp: Date.now()
        };
        saveChatToServer(updatedChat);
        return updatedChat;
      }
      return chat;
    });

    setChats(updatedChatsWithUser);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
    };

    setChats(prev => prev.map(chat => 
      chat.id === currentChatId 
        ? { ...chat, messages: [...chat.messages, assistantMessage] } 
        : chat
    ));

    try {
      const chatToStream = updatedChatsWithUser.find(c => c.id === currentChatId);
      const stream = await streamChatWithGemini(currentInput, chatToStream?.messages.slice(0, -1) || [], currentImage || undefined);
      let fullContent = '';
      let groundingLinks: { title: string, uri: string }[] = [];

      for await (const chunk of stream) {
        const text = chunk.text || '';
        fullContent += text;
        
        // Handle function calls
        const functionCalls = chunk.functionCalls;
        if (functionCalls) {
          for (const call of functionCalls) {
            if (call.name === 'generateImage') {
              const prompt = (call.args as any).prompt;
              try {
                const imageUrl = await generateImageWithGemini(prompt);
                setChats((prev) => prev.map((chat) =>
                  chat.id === currentChatId 
                    ? {
                        ...chat,
                        messages: chat.messages.map(msg => 
                          msg.id === assistantMessageId ? { 
                            ...msg, 
                            image: { data: imageUrl.split(',')[1], mimeType: 'image/png' },
                            content: msg.content || 'İşte istediğin görsel:'
                          } : msg
                        )
                      }
                    : chat
                ));
                fullContent = 'İşte istediğin görsel:';
              } catch (err) {
                console.error('Image generation failed:', err);
                fullContent += '\n\n(Görsel oluşturulurken bir hata oluştu.)';
              }
            }
          }
        }

        // Extract grounding metadata if available
        const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          chunks.forEach((c: any) => {
            if (c.web) {
              groundingLinks.push({ title: c.web.title, uri: c.web.uri });
            }
          });
        }

        setChats((prev) => {
          const newChats = prev.map((chat) =>
            chat.id === currentChatId 
              ? {
                  ...chat,
                  messages: chat.messages.map(msg => 
                    msg.id === assistantMessageId ? { 
                      ...msg, 
                      content: fullContent,
                      groundingLinks: groundingLinks.length > 0 ? Array.from(new Set(groundingLinks.map(l => l.uri))).map(uri => groundingLinks.find(l => l.uri === uri)!) : undefined
                    } : msg
                  )
                }
              : chat
          );
          return newChats;
        });
      }
      
      // Save final response to server
      const finalChat = chats.find(c => c.id === currentChatId);
      if (finalChat) {
        const updatedMessages = finalChat.messages.map(msg => 
          msg.id === assistantMessageId ? { ...msg, content: fullContent } : msg
        );
        saveChatToServer({ ...finalChat, messages: updatedMessages });
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/20"
        >
          <Sparkles className="w-8 h-8 text-black" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-[#0A0A0A]/95 backdrop-blur-2xl border-r border-white/5 flex flex-col md:relative shadow-2xl"
          >
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 px-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Sparkles className="w-5 h-5 text-black" />
                </div>
                <span className="font-semibold text-lg tracking-tight">Artemis AI</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors md:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-2 space-y-3">
              <button
                onClick={createNewChat}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 transition-all font-medium shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Yeni Sohbet</span>
              </button>

              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                <input 
                  type="text"
                  placeholder="Sohbetlerde ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/30 focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-hide py-2">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-3 py-2">
                Sohbet Geçmişi
              </div>
              {filteredChats.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-zinc-600 italic">
                    {searchQuery ? 'Sonuç bulunamadı.' : 'Henüz bir sohbet yok.'}
                  </p>
                </div>
              ) : (
                filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      if (window.innerWidth < 768) setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative",
                      activeChatId === chat.id 
                        ? "bg-white/10 text-white border border-white/10" 
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    )}
                  >
                    <MessageSquare className={cn(
                      "w-4 h-4 shrink-0",
                      activeChatId === chat.id ? "text-emerald-400" : "text-zinc-600"
                    )} />
                    <span className="text-sm font-medium truncate flex-1 text-left">
                      {chat.title}
                    </span>
                    <Trash2 
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all shrink-0" 
                    />
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-white/5">
              <div className="flex items-center gap-3 px-2 py-2 group">
                <img 
                  src={user.avatar_url} 
                  alt={user.display_name} 
                  className="w-8 h-8 rounded-full border border-white/10"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.display_name}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Artemis AI Pro</p>
                </div>
                {/* Logout button removed for direct access */}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 atmosphere-bg">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#050505]/60 backdrop-blur-2xl sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="flex flex-col">
              <h2 className="text-sm font-medium text-zinc-200 truncate max-w-[200px] md:max-w-md">
                {activeChat ? activeChat.title : 'Artemis AI'}
              </h2>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", isLoading ? "bg-emerald-500 animate-pulse" : "bg-emerald-500/40")} />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  {isLoading ? 'İşleniyor...' : 'Hazır'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <Activity className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sistem Aktif</span>
            </div>
            <button 
              onClick={createNewChat}
              className="p-2 hover:bg-white/5 rounded-lg transition-all text-zinc-500 md:hidden"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center text-center space-y-6 py-20"
              >
                <div className="w-20 h-20 rounded-3xl bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/20 mb-4">
                  <Sparkles className="w-10 h-10 text-black" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-white">Merhaba, {user.display_name.split(' ')[0]}</h1>
                <p className="text-zinc-400 max-w-md leading-relaxed">
                  Bugün senin için ne yapabilirim? Artemis AI her zaman yanında.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-8">
                  {[
                    "Bugün için bir çalışma planı hazırla",
                    "JavaScript'te async/await nasıl çalışır?",
                    "Bana ilham verici bir hikaye anlat",
                    "Sağlıklı bir akşam yemeği tarifi ver"
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                      }}
                      className="p-4 text-left text-sm rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-zinc-300 flex items-center justify-between group"
                    >
                      {suggestion}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-6",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row",
                    index === messages.length - 1 && "animate-in fade-in slide-in-from-bottom-2 duration-300"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-sm overflow-hidden",
                    message.role === 'user' ? "bg-zinc-800" : "bg-emerald-500"
                  )}>
                    {message.role === 'user' ? (
                      <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Bot className="w-4 h-4 text-black" />
                    )}
                  </div>
                  <div className={cn(
                    "flex-1 space-y-2 max-w-[85%]",
                    message.role === 'user' ? "text-right" : "text-left"
                  )}>
                    <div className={cn(
                      "inline-block rounded-2xl px-5 py-3 text-sm leading-relaxed relative group/msg",
                      message.role === 'user' 
                        ? "bg-emerald-500/10 text-emerald-100 border border-emerald-500/20" 
                        : "bg-white/5 text-zinc-200 border border-white/5"
                    )}>
                      <div className="markdown-body prose prose-invert prose-sm max-w-none">
                        {message.image && (
                          <div className="mb-3 rounded-xl overflow-hidden border border-white/10 max-w-sm">
                            <img 
                              src={`data:${message.image.mimeType};base64,${message.image.data}`} 
                              alt="Uploaded" 
                              className="w-full h-auto"
                            />
                          </div>
                        )}
                        <Markdown>{message.content}</Markdown>
                        {message.role === 'model' && message.content === '' && (
                          <div className="flex gap-1 py-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                          </div>
                        )}
                      </div>

                      {message.role === 'model' && message.content !== '' && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {message.groundingLinks && message.groundingLinks.length > 0 && (
                            <div className="w-full flex flex-wrap gap-2 mb-2">
                              {message.groundingLinks.map((link, i) => (
                                <a 
                                  key={i}
                                  href={link.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
                                >
                                  <Globe className="w-3 h-3 text-emerald-500" />
                                  {link.title}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1 p-1 rounded-lg bg-black/20 border border-white/5">
                            <button
                              onClick={() => handlePlayAudio(message.content, message.id)}
                              title="Sesli Dinle"
                              className={cn(
                                "p-1.5 rounded-md transition-all",
                                isPlaying === message.id ? "bg-emerald-500 text-black" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                              )}
                            >
                              <Volume2 className={cn("w-3.5 h-3.5", isPlaying === message.id && "animate-pulse")} />
                            </button>
                            <button
                              onClick={() => handleCopy(message.content, message.id)}
                              title="Kopyala"
                              className="p-1.5 rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-all"
                            >
                              {copiedId === message.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={handleRegenerate}
                              title="Yeniden Oluştur"
                              className="p-1.5 rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-all"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent">
          <div className="max-w-3xl mx-auto relative">
            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-full left-0 mb-4 p-2 bg-[#161616] border border-white/10 rounded-2xl flex items-center gap-3 shadow-2xl"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/5">
                  <img 
                    src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Görsel Hazır</p>
                  <p className="text-xs text-zinc-300 truncate">Analiz için gönderilmeyi bekliyor</p>
                </div>
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-red-400 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
            <div className="relative flex items-end gap-2 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl p-2 focus-within:border-emerald-500/50 transition-all shadow-2xl">
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="image-upload"
                  className="p-3 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-emerald-400 transition-all cursor-pointer shrink-0"
                  title="Görsel Yükle"
                >
                  <ImageIcon className="w-5 h-5" />
                </label>
                <button
                  onClick={handleGenerateImage}
                  className="p-3 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-emerald-400 transition-all shrink-0"
                  title="Görsel Oluştur (Magic)"
                >
                  <Wand2 className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 relative flex items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                          const file = items[i].getAsFile();
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const base64String = (reader.result as string).split(',')[1];
                              setSelectedImage({
                                data: base64String,
                                mimeType: file.type
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Artemis'e bir şeyler sor veya görsel oluştur..."
                  className="w-full bg-transparent border-none focus:ring-0 text-sm py-3 px-4 resize-none max-h-40 min-h-[44px] placeholder:text-zinc-600 scrollbar-hide"
                  rows={1}
                />
                <button
                  onClick={handleVoiceInput}
                  className={cn(
                    "absolute right-2 bottom-2 p-2 rounded-lg transition-all",
                    isListening ? "bg-red-500 text-white animate-pulse" : "text-zinc-500 hover:text-emerald-400 hover:bg-white/5"
                  )}
                  title="Sesle Yaz"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className={cn(
                  "p-3 rounded-xl transition-all shrink-0 shadow-lg",
                  (input.trim() || selectedImage) && !isLoading 
                    ? "bg-emerald-500 text-black hover:scale-105 active:scale-95 shadow-emerald-500/20" 
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-center mt-3 text-zinc-600 uppercase tracking-widest font-medium">
              Artemis AI hata yapabilir. Önemli bilgileri kontrol etmeyi unutma.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
