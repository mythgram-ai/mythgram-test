import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  FolderPlus,
  Menu,
  Settings,
  Save,
  X,
  Folder,
  FileText,
} from 'lucide-react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface SkillItem {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  folder_path: string;
  skill_md_path: string;
  subfolders: string[];
  files: string[];
}

interface SkillsPageProps {
  onOpenSettings: () => void;
  onOpenSidebar: () => void;
}

export const SkillsPage: React.FC<SkillsPageProps> = ({
  onOpenSettings,
  onOpenSidebar,
}) => {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [skillMdContent, setSkillMdContent] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSkillMd, setNewSkillMd] = useState('# Skill Name\n\n## Overview\nDescribe when and how the agent should use this skill.\n');
  const [subfolderInput, setSubfolderInput] = useState('');
  const [subfolders, setSubfolders] = useState<string[]>(['references', 'scripts']);
  const [errorMsg, setErrorMsg] = useState('');

  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (Array.isArray(data.skills)) {
        setSkills(data.skills);
        if (!selectedName && data.skills.length > 0) {
          setSelectedName(data.skills[0].name);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedName]);

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    if (!selectedName) {
      setSkillMdContent('');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(selectedName)}`);
        const data = await res.json();
        setSkillMdContent(data.skillMdContent || '');
      } catch {
        setSkillMdContent('');
      }
    })();
  }, [selectedName]);

  const selectedSkill = skills.find((s) => s.name === selectedName) || null;

  const handleAddSubfolder = () => {
    const clean = subfolderInput.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    if (!subfolders.includes(clean)) {
      setSubfolders([...subfolders, clean]);
    }
    setSubfolderInput('');
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          skillMdContent: newSkillMd,
          subfolders,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || 'Failed to create skill');
        return;
      }
      setSkills(data.skills || []);
      if (data.skill?.name) {
        setSelectedName(data.skill.name);
      }
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error creating skill');
    }
  };

  const handleDeleteSkill = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (Array.isArray(data.skills)) {
      setSkills(data.skills);
      if (selectedName === name) {
        setSelectedName(data.skills[0]?.name || null);
      }
    }
  };

  return (
    <main className="main-canvas">
      <header className="main-topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-btn mobile-menu-btn"
            onClick={onOpenSidebar}
            title="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="app-topbar-brand">
            <BookOpen size={15} />
            <span>Skills Library</span>
            <span className="version-block">.mythgram/skills</span>
          </div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn-primary inline-center"
            style={{ padding: '5px 11px', fontSize: 12 }}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={13} />
            Create Skill
          </button>
          <button
            type="button"
            className="topbar-btn"
            onClick={onOpenSettings}
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left List of Skills */}
        <div
          style={{
            width: 'clamp(240px, 32%, 340px)',
            borderRight: '1px solid #1e1e22',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0c0c0f',
            overflowY: 'auto',
            padding: 8,
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: '#71717a', padding: '4px 6px' }}>
            AVAILABLE SKILLS ({skills.length})
          </div>
          {skills.map((skill) => (
            <div
              key={skill.name}
              onClick={() => setSelectedName(skill.name)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                backgroundColor:
                  selectedName === skill.name ? '#1c1c22' : '#131317',
                border:
                  selectedName === skill.name
                    ? '1px solid #383842'
                    : '1px solid #1f1f25',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 12.5, color: '#f4f4f5', fontFamily: 'JetBrains Mono, monospace' }}>
                  {skill.name}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 24, height: 24 }}
                  onClick={(e) => handleDeleteSkill(skill.name, e)}
                  title="Delete skill"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: '#9e9ea7', marginTop: 4, lineHeight: 1.35 }}>
                {skill.description}
              </div>
              <div style={{ fontSize: 10.5, color: '#64646c', marginTop: 6, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {skill.skill_md_path}
              </div>
            </div>
          ))}
        </div>

        {/* Right Skill Detail & SKILL.md Preview */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, backgroundColor: '#09090b' }}>
          {selectedSkill ? (
            <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#f4f4f5' }}>
                  {selectedSkill.name}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#a1a1aa' }}>
                  {selectedSkill.description}
                </p>
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace' }}>
                  SKILL.md Path: {selectedSkill.skill_md_path}
                </div>
              </div>

              <div className="form-grid-2">
                <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#121216', border: '1px solid #222228' }}>
                  <div className="field-label">Subfolders ({selectedSkill.subfolders.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {selectedSkill.subfolders.length === 0 ? (
                      <span style={{ fontSize: 11.5, color: '#64646c' }}>No subfolders</span>
                    ) : (
                      selectedSkill.subfolders.map((sf) => (
                        <span
                          key={sf}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: 5,
                            backgroundColor: '#1a1a22',
                            fontSize: 11.5,
                            fontFamily: 'JetBrains Mono, monospace',
                          }}
                        >
                          <Folder size={12} color="#60a5fa" />
                          {sf}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#121216', border: '1px solid #222228' }}>
                  <div className="field-label">Files ({selectedSkill.files.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {selectedSkill.files.map((f) => (
                      <span
                        key={f}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 5,
                          backgroundColor: '#1a1a22',
                          fontSize: 11.5,
                          fontFamily: 'JetBrains Mono, monospace',
                        }}
                      >
                        <FileText size={12} color="#a1a1aa" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 8, backgroundColor: '#111114', border: '1px solid #232329' }}>
                <div className="field-label" style={{ marginBottom: 8 }}>
                  SKILL.md Content
                </div>
                <MarkdownRenderer content={skillMdContent} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Create Skill Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <form
            onSubmit={handleCreateSkill}
            className="workspace-modal"
            style={{ maxWidth: 680 }}
          >
            <div className="workspace-modal-title">
              <span>Create Skill Manually (.mythgram/skills)</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 12 }}>
                {errorMsg}
              </div>
            )}

            <div className="form-grid-2">
              <div>
                <label className="field-label">Skill Name (lowercase-with-hyphens)</label>
                <input
                  required
                  className="input-field"
                  placeholder="e.g. data-pipeline-builder"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Skill Description</label>
                <input
                  required
                  className="input-field"
                  placeholder="When and how to use this skill..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Create Subfolders Inside Skill Directory</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input-field"
                  placeholder="Subfolder name (e.g. references, scripts, templates)"
                  value={subfolderInput}
                  onChange={(e) => setSubfolderInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary inline-center"
                  onClick={handleAddSubfolder}
                >
                  <FolderPlus size={13} />
                  Add Subfolder
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {subfolders.map((sf) => (
                  <span
                    key={sf}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 6,
                      backgroundColor: '#1c1c24',
                      fontSize: 11.5,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    <Folder size={12} color="#60a5fa" />
                    {sf}
                    <X
                      size={11}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        setSubfolders(subfolders.filter((item) => item !== sf))
                      }
                    />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">Main SKILL.md Content</label>
              <textarea
                required
                rows={8}
                className="input-field"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                value={newSkillMd}
                onChange={(e) => setNewSkillMd(e.target.value)}
              />
            </div>

            <div className="workspace-footer">
              <span style={{ fontSize: 11.5, color: '#71717a' }}>
                Saved to .mythgram/skills/{newName || '<skill-name>'}/SKILL.md
              </span>
              <div className="workspace-footer-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary inline-center">
                  <Save size={13} />
                  Save Skill
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};
