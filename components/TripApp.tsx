'use client';

import {useEffect, useMemo, useState} from 'react';
import type {Place, TripState} from '@/lib/types';

const tabs = ['Today', 'Itinerary', 'Food', 'Places', 'Checklist'] as const;
type Tab = (typeof tabs)[number];

function activeDayIndex(days: TripState['days']) {
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const exact = days.findIndex(day => day.date === local);
  if (exact >= 0) return exact;
  const future = days.findIndex(day => day.date > local);
  return future >= 0 ? future : days.length - 1;
}

function placeMatchesDay(place: Place, city: string) {
  if (city.includes('Toronto')) return place.region === 'Toronto';
  if (city.includes('Buffalo') || city.includes('Niagara')) return place.region === 'Niagara & Buffalo';
  return true;
}

export default function TripApp() {
  const [state, setState] = useState<TripState | null>(null);
  const [tab, setTab] = useState<Tab>('Today');
  const [cloud, setCloud] = useState(false);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('All');
  const [category, setCategory] = useState('All');
  const [priority, setPriority] = useState('All');
  const [showVisited, setShowVisited] = useState(true);

  useEffect(() => {
    fetch('/api/state')
      .then(response => response.json())
      .then(result => {
        const local = localStorage.getItem('trip-state');
        setState(result.cloud ? result.state : local ? JSON.parse(local) : result.state);
        setCloud(result.cloud);
      });
  }, []);

  async function persist(next: TripState) {
    setState(next);
    localStorage.setItem('trip-state', JSON.stringify(next));
    if (cloud) {
      await fetch('/api/state', {
        method: 'PUT',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(next),
      });
    }
  }

  function toggleDay(dayIndex: number, itemIndex: number) {
    if (!state) return;
    const next = structuredClone(state);
    next.days[dayIndex].items[itemIndex].done = !next.days[dayIndex].items[itemIndex].done;
    void persist(next);
  }

  function toggleList(key: 'foods' | 'packing', index: number) {
    if (!state) return;
    const next = structuredClone(state);
    next[key][index].done = !next[key][index].done;
    void persist(next);
  }

  function toggleVisited(placeId: string) {
    if (!state) return;
    const next = structuredClone(state);
    const place = next.places.find(item => item.id === placeId);
    if (place) place.visited = !place.visited;
    void persist(next);
  }

  const currentDayIndex = useMemo(() => (state ? activeDayIndex(state.days) : 0), [state]);
  const currentDay = state?.days[currentDayIndex];

  const filtered = useMemo(() => {
    if (!state) return [];
    const needle = query.trim().toLowerCase();
    return state.places.filter(place =>
      (region === 'All' || place.region === region) &&
      (category === 'All' || place.category === category) &&
      (priority === 'All' || place.priority === priority) &&
      (showVisited || !place.visited) &&
      (!needle || `${place.name} ${place.notes} ${place.tags.join(' ')}`.toLowerCase().includes(needle)),
    );
  }, [state, query, region, category, priority, showVisited]);

  const nearbySuggestions = useMemo(() => {
    if (!state || !currentDay) return [];
    return state.places
      .filter(place => placeMatchesDay(place, currentDay.city) && !place.visited)
      .sort((a, b) => {
        const rank = {must: 0, possible: 1, backup: 2};
        return rank[a.priority] - rank[b.priority];
      })
      .slice(0, 4);
  }, [state, currentDay]);

  if (!state) return <main className="shell"><div className="card">Loading trip…</div></main>;

  const completedToday = currentDay?.items.filter(item => item.done).length ?? 0;
  const totalToday = currentDay?.items.length ?? 0;
  const tripProgress = state.days.flatMap(day => day.items);
  const completedTrip = tripProgress.filter(item => item.done).length;

  return <>
    <header className="hero">
      <div className="heroInner">
        <div><div className="eyebrow">TRIP HUB</div><h1>Toronto · Niagara · Buffalo</h1><p>September 24–October 1, 2026</p></div>
        <div className="headerActions"><span className={`sync ${cloud ? 'online' : ''}`}>{cloud ? '● Shared sync' : '○ Device only'}</span><button className="btn ghost" onClick={() => fetch('/api/auth', {method: 'DELETE'}).then(() => location.reload())}>Lock</button></div>
      </div>
    </header>

    <main className="shell">
      <nav className="tabs" aria-label="Trip sections">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>

      {tab === 'Today' && currentDay && <section>
        <div className="todayHero card"><div><div className="eyebrow">NEXT UP</div><h2>{currentDay.label} · {currentDay.city}</h2><p className="muted">The dashboard automatically follows the trip date. Before departure, it shows your first travel day.</p></div><div className="progressRing" aria-label={`${completedToday} of ${totalToday} complete`}><strong>{completedToday}/{totalToday}</strong><span>done</span></div></div>
        <div className="statGrid"><div className="stat"><span>Trip progress</span><strong>{completedTrip}/{tripProgress.length}</strong></div><div className="stat"><span>Saved places</span><strong>{state.places.length}</strong></div><div className="stat"><span>Foods remaining</span><strong>{state.foods.filter(item => !item.done).length}</strong></div></div>
        <h2 className="sectionTitle">Today’s plan</h2>
        {currentDay.items.map((item, index) => <label className={`card timelineItem ${item.done ? 'done' : ''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={() => toggleDay(currentDayIndex, index)} /><div className="timeBadge">{item.time}</div><div className="timelineCopy"><div className="titleRow"><h3>{item.title}</h3>{item.optional && <span className="chip neutral">Optional</span>}</div>{item.details && <p className="muted">{item.details}</p>}{item.mapUrl && <a className="textLink" href={item.mapUrl} target="_blank" rel="noreferrer">Open directions ↗</a>}</div></label>)}
        <div className="between sectionHeading"><h2 className="sectionTitle">Worth keeping nearby</h2><button className="textButton" onClick={() => {setRegion(currentDay.city.includes('Toronto') ? 'Toronto' : 'Niagara & Buffalo'); setTab('Places');}}>See all</button></div>
        <div className="grid compactGrid">{nearbySuggestions.map(place => <PlaceCard key={place.id} place={place} onToggle={() => toggleVisited(place.id)} />)}</div>
      </section>}

      {tab === 'Itinerary' && <section><div className="pageIntro"><div><div className="eyebrow">FULL SCHEDULE</div><h2>Eight days, one clear plan</h2></div><span className="chip">{completedTrip}/{tripProgress.length} complete</span></div>{state.days.map((day, dayIndex) => <article className="card dayCard" key={day.date}><div className="between dayHeader"><div><div className="eyebrow">{day.date}</div><h2>{day.label} · {day.city}</h2></div><span className="chip">{day.items.filter(item => item.done).length}/{day.items.length}</span></div>{day.items.map((item, itemIndex) => <label className={`itineraryRow ${item.done ? 'done' : ''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={() => toggleDay(dayIndex, itemIndex)} /><div className="itineraryTime">{item.time}</div><div><div className="titleRow"><strong>{item.title}</strong>{item.optional && <span className="chip neutral">Optional</span>}</div>{item.details && <p className="muted small">{item.details}</p>}</div></label>)}</article>)}</section>}

      {tab === 'Food' && <section><div className="pageIntro"><div><div className="eyebrow">LOCAL FLAVORS</div><h2>Eat the trip</h2></div><span className="chip">{state.foods.filter(item => item.done).length}/{state.foods.length} tried</span></div>{['Try', 'Bring home'].map(group => <div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.foods.map((food, index) => food.category === group && <label className={`card checkCard ${food.done ? 'done' : ''}`} key={food.id}><input type="checkbox" checked={food.done} onChange={() => toggleList('foods', index)} /><div><h3>{food.title}</h3>{food.notes && <p className="muted small">{food.notes}</p>}</div></label>)}</div></div>)}</section>}

      {tab === 'Places' && <section><div className="pageIntro"><div><div className="eyebrow">SAVED SPOTS</div><h2>Find the right place fast</h2></div><span className="chip">{filtered.length} shown</span></div><div className="filterPanel card"><input className="field searchField" placeholder="Search restaurants, museums, notes…" value={query} onChange={event => setQuery(event.target.value)} /><div className="filterGrid"><select className="field" value={region} onChange={event => setRegion(event.target.value)}><option>All</option><option>Toronto</option><option>Niagara & Buffalo</option></select><select className="field" value={category} onChange={event => setCategory(event.target.value)}><option>All</option>{[...new Set(state.places.map(place => place.category))].sort().map(value => <option key={value}>{value}</option>)}</select><select className="field" value={priority} onChange={event => setPriority(event.target.value)}><option>All</option><option value="must">Must do</option><option value="possible">Possible</option><option value="backup">Backup</option></select></div><label className="toggleLine"><input type="checkbox" checked={showVisited} onChange={event => setShowVisited(event.target.checked)} /> Show visited places</label></div><div className="grid placeGrid">{filtered.map(place => <PlaceCard key={place.id} place={place} onToggle={() => toggleVisited(place.id)} />)}</div>{filtered.length === 0 && <div className="empty card">No saved places match those filters.</div>}</section>}

      {tab === 'Checklist' && <section><div className="pageIntro"><div><div className="eyebrow">PACK SMART</div><h2>Nothing important left behind</h2></div><span className="chip">{state.packing.filter(item => item.done).length}/{state.packing.length} packed</span></div>{[...new Set(state.packing.map(item => item.category))].map(group => <div key={group} className="listGroup"><h2 className="sectionTitle">{group}</h2><div className="grid">{state.packing.map((item, index) => item.category === group && <label className={`card checkCard ${item.done ? 'done' : ''}`} key={item.id}><input type="checkbox" checked={item.done} onChange={() => toggleList('packing', index)} /><div>{item.title}</div></label>)}</div></div>)}</section>}
    </main>
  </>;
}

function PlaceCard({place, onToggle}: {place: Place; onToggle: () => void}) {
  return <article className={`card placeCard ${place.visited ? 'visited' : ''}`}><div className="between"><span className={`priority priority-${place.priority}`}>{place.priority === 'must' ? 'Must do' : place.priority}</span><button className="visitedButton" onClick={onToggle}>{place.visited ? '✓ Visited' : 'Mark visited'}</button></div><h3>{place.name}</h3><div className="muted small">{place.region} · {place.category}</div>{place.notes && <p>{place.notes}</p>}{place.tags.length > 0 && <div className="tagRow">{place.tags.slice(0, 4).map(tag => <span className="chip neutral" key={tag}>{tag}</span>)}</div>}<div className="placeActions"><a className="btn primary" href={place.mapUrl} target="_blank" rel="noreferrer">Directions</a>{place.menuUrl && <a className="btn" href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}{place.websiteUrl && <a className="btn" href={place.websiteUrl} target="_blank" rel="noreferrer">Website</a>}</div></article>;
}
