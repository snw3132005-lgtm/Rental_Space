import { useMemo, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useChatWithAssistant, useCreateReservation, useCreateViewing, useGetProperty, useGetPropertyAvailability, useListProperties, getListPropertiesQueryKey, getGetPropertyQueryKey, getGetPropertyAvailabilityQueryKey } from '@workspace/api-client-react';
import type { AssistantMessage, Property, RentalPreferences, ReservationInput, ViewingInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, useRoute, Router as WouterRouter } from 'wouter';
import { ArrowDownRight, ArrowLeft, ArrowRight, BedDouble, CalendarDays, Check, CheckCircle2, Clock3, Heart, Home as HomeIcon, MapPin, Menu, MessageCircle, MoveUpRight, Ruler, Search, Send, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';

const queryClient = new QueryClient();
const money = (amount: number) => `₹${new Intl.NumberFormat('en-IN').format(amount)}`;
const today = () => new Date().toISOString().slice(0, 10);
const preferenceKey = (preferences: RentalPreferences) => JSON.stringify([preferences.location, preferences.maxRent, preferences.bedrooms, preferences.moveInDate, preferences.moveOutDate]);

const palette = [
  'linear-gradient(140deg,#d8c6aa 0%,#b8a98f 48%,#7b8175 100%)',
  'linear-gradient(140deg,#e0c6a6 0%,#c1916f 53%,#817567 100%)',
  'linear-gradient(140deg,#b8c7b9 0%,#8d9d8c 48%,#65776d 100%)',
  'linear-gradient(140deg,#d7bb9c 0%,#a58a6b 48%,#737863 100%)',
];

function Brand() {
  return <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark"><HomeIcon size={17} strokeWidth={2.1} /></span><span>Nestly<span className="brand-light"> rentals</span></span></Link>;
}

function Header({ detail = false }: { detail?: boolean }) {
  const [menu, setMenu] = useState(false);
  return <header className="topbar"><div className="topbar-inner">
    <Brand />
    <nav className={menu ? 'nav-links open' : 'nav-links'}><a href={detail ? '/#homes' : '#homes'} onClick={() => setMenu(false)}>Find a home</a><a href={detail ? '/#how' : '#how'} onClick={() => setMenu(false)}>How it works</a><span className="nav-trust"><ShieldCheck size={15} /> Straight answers, always</span></nav>
    <a className="header-cta" href={detail ? '/#homes' : '#homes'}>Start looking <ArrowRight size={15} /></a>
    <button className="menu-toggle" onClick={() => setMenu(!menu)} aria-label="Toggle navigation" data-testid="button-menu">{menu ? <X size={20} /> : <Menu size={20} />}</button>
  </div></header>;
}

function Home() {
  const [city, setCity] = useState('Bengaluru');
  const [maxRent, setMaxRent] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [assistantResults, setAssistantResults] = useState<Property[] | null>(null);
  const [preferences, setPreferences] = useState<RentalPreferences | null>(null);
  const [confirmedPreferenceKey, setConfirmedPreferenceKey] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [visitProperty, setVisitProperty] = useState<Property | null>(null);
  const [bookingProperty, setBookingProperty] = useState<Property | null>(null);
  const [bookingStage, setBookingStage] = useState<'choose' | 'reserve' | 'visit'>('choose');
  const [showCompare, setShowCompare] = useState(false);
  const params = useMemo(() => ({ city, ...(maxRent ? { maxRent: Number(maxRent) } : {}), ...(bedrooms ? { bedrooms: Number(bedrooms) } : {}) }), [city, maxRent, bedrooms]);
  const { data: properties, isLoading, isError, refetch } = useListProperties(params, { query: { queryKey: getListPropertiesQueryKey(params) } });
  const chat = useChatWithAssistant();
  const list = assistantResults ?? properties ?? [];
  const selectedProperty = list.find((property) => property.id === selectedPropertyId) ?? null;
  const datesConfirmed = Boolean(preferences?.moveInDate && preferences?.moveOutDate && confirmedPreferenceKey === preferenceKey(preferences));
  const toggleSaved = (id: number) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleCompare = (id: number) => setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  const askAssistant = (text: string) => {
    if (!text.trim() || chat.isPending) return;
    const next = [...messages, { role: 'user' as const, content: text.trim() }];
    setMessages(next); setQuery('');
    chat.mutate({ data: { messages: next } }, { onSuccess: (reply) => {
      setMessages([...next, { role: 'assistant', content: reply.answer }]);
      setAssistantResults(reply.properties);
      setPreferences(reply.preferences);
      setConfirmedPreferenceKey((current) => current === preferenceKey(reply.preferences) ? current : null);
      setSelectedPropertyId((current) => current !== null && reply.properties.some((property) => property.id === current) ? current : null);
      document.getElementById('homes')?.scrollIntoView({ behavior: 'smooth' });
    } });
  };
  const closeBookingFlow = () => {
    setBookingProperty(null);
    setBookingStage('choose');
    setSelectedPropertyId(null);
  };
  return <main>
    <Header />
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-copy animate-enter">
          <div className="eyebrow"><span className="eyebrow-dot" /> RENTING, MADE HUMAN</div>
          <h1>A home that<br />feels like <em>yours.</em></h1>
          <p className="hero-intro">Tell us what you need. We’ll help you find a place that fits your life, your budget, and your next chapter.</p>
          <div className="hero-note"><span className="note-icon"><MessageCircle size={16} /></span><span>Skip the filters. <strong>Just tell us.</strong></span><ArrowDownRight size={17} className="note-arrow" /></div>
          <div className="hero-stamp"><span className="stamp-number">01</span><span>Less searching.<br />More settling in.</span></div>
        </div>
        <div className="assistant-wrap animate-enter delay-1">
          <div className="assistant-card">
            <div className="assistant-heading"><div className="assistant-icon"><Sparkles size={18} /></div><div><h2>Your home, in your words.</h2><p>A real search starts with what matters to you.</p></div><span className="assistant-live"><i /> READY</span></div>
            {messages.length > 0 && <div className="chat-thread" aria-live="polite">{messages.slice(-4).map((message, index) => <div key={`${message.role}-${index}`} className={`chat-line ${message.role}`}><span>{message.content}</span></div>)}{chat.isPending && <div className="chat-line assistant"><span className="thinking"><i /><i /><i /></span></div>}</div>}
            <div className="prompt-label">WHAT ARE YOU LOOKING FOR?</div>
            <textarea id="rental-chat-input" aria-label="Describe your ideal rental" data-testid="input-rental-prompt" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAssistant(query); } }} placeholder="A 2-bed in Indiranagar, ₹45,000/month, Dec 5 2026 to Nov 30 2027..." maxLength={2000} />
            <div className="assistant-bottom"><span>Try “sunny balcony, room for my plants...”</span><button className="send-button" onClick={() => askAssistant(query)} disabled={!query.trim() || chat.isPending} data-testid="button-ask-assistant">{chat.isPending ? <span className="mini-loader" /> : <Send size={16} />}<span className="sr-only">Send request</span></button></div>
            {chat.isError && <p className="inline-error">We couldn’t reach your home helper just now. Try again, or use the simple search below.</p>}
            <div className="quick-prompts"><span>OR START WITH</span>{['2 beds under ₹40k', 'Move in soon', 'Near the metro'].map((prompt) => <button key={prompt} onClick={() => askAssistant(prompt)}>{prompt}<ArrowRight size={12} /></button>)}</div>
          </div>
          <div className="assistant-caption"><span className="caption-line" /> No endless filters. No guesswork. Just the right details.</div>
        </div>
      </div>
      <div className="hero-bottom"><span>MADE FOR THE WAY INDIA RENTS</span><span>Homes in Bengaluru <i /> Mumbai <i /> Pune <i /> and beyond</span></div>
    </section>

    <section className="search-strip" aria-label="Refine rental results">
      <div className="search-title"><SlidersHorizontal size={16} /><span>Or narrow it down</span></div>
      <label><span>YOUR CITY</span><select value={city} onChange={(event) => {setCity(event.target.value); setAssistantResults(null);}} data-testid="select-city"><option>Bengaluru</option><option>Mumbai</option><option>Pune</option><option>Hyderabad</option><option>Chennai</option><option>Delhi</option></select></label>
      <label><span>MONTHLY RENT</span><select value={maxRent} onChange={(event) => {setMaxRent(event.target.value); setAssistantResults(null);}} data-testid="select-rent"><option value="">Any budget</option><option value="25000">Up to ₹25,000</option><option value="35000">Up to ₹35,000</option><option value="45000">Up to ₹45,000</option><option value="60000">Up to ₹60,000</option></select></label>
      <label><span>BEDROOMS</span><select value={bedrooms} onChange={(event) => {setBedrooms(event.target.value); setAssistantResults(null);}} data-testid="select-bedrooms"><option value="">Any size</option><option value="1">1 bedroom</option><option value="2">2 bedrooms</option><option value="3">3+ bedrooms</option></select></label>
      <button className="clear-filters" onClick={() => {setMaxRent('');setBedrooms('');setAssistantResults(null);}}>Clear all <X size={13} /></button>
    </section>

    <section className="homes-section" id="homes">
      <div className="section-head">
        <div><div className="eyebrow small"><span className="eyebrow-dot" /> YOUR SHORTLIST STARTS HERE</div><h2>{assistantResults ? 'A few homes worth a look.' : 'Homes with the details up front.'}</h2><p>Real information, clear monthly rent, and an easy next step.</p></div>
        <div className="results-meta"><span className="results-count">{list.length.toString().padStart(2, '0')}</span><span>homes to<br />explore</span><span className="results-divider" /><button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2} className="compare-top"><span>{compareIds.length}/2</span> Compare <ArrowRight size={14} /></button></div>
      </div>
      <div className="inventory-note"><span><ShieldCheck size={16} /></span><p><strong>A note on these homes:</strong> Initial inventory is sample data, not live listings. Availability, rent and details should be confirmed before making plans.</p></div>
      {preferences && <div className="requirements-summary" aria-live="polite" data-testid="rental-requirements-summary">
        <div className="requirements-heading"><div><div className="eyebrow small"><span className="eyebrow-dot" /> YOUR RENTAL PLAN</div><h3>Here’s what we’ve got so far.</h3></div>{datesConfirmed && <span className="confirmed-badge"><CheckCircle2 size={14} /> DATES CONFIRMED</span>}</div>
        <div className="requirements-grid">
          <div><span>LOCATION</span><strong>{preferences.location || 'Not set yet'}</strong></div>
          <div><span>MONTHLY BUDGET</span><strong>{preferences.maxRent ? `Up to ${money(preferences.maxRent)}` : 'Flexible'}</strong></div>
          <div><span>BEDROOMS</span><strong>{preferences.bedrooms ? `${preferences.bedrooms}+ bedroom${preferences.bedrooms === 1 ? '' : 's'}` : 'Any size'}</strong></div>
          <div><span>MOVE-IN</span><strong>{preferences.moveInDate ? shortDate(preferences.moveInDate) : 'Exact day needed'}</strong></div>
          <div><span>MOVE-OUT</span><strong>{preferences.moveOutDate ? shortDate(preferences.moveOutDate) : 'Exact day needed'}</strong></div>
        </div>
        <div className="requirements-footer">
          {datesConfirmed ? <p>Your dates are confirmed. Choose a home below to continue.</p> : preferences.moveInDate && preferences.moveOutDate ? <><p>Check these dates, then confirm them to unlock booking options.</p><button className="button-primary" onClick={() => setConfirmedPreferenceKey(preferenceKey(preferences))} data-testid="button-confirm-dates">Confirm these dates <Check size={15} /></button></> : <><p>Tell Nestly the exact move-in and move-out days you prefer.</p><button className="button-outline" onClick={() => {document.getElementById('rental-chat-input')?.scrollIntoView({behavior:'smooth',block:'center'}); document.getElementById('rental-chat-input')?.focus();}}>Add dates <ArrowRight size={14} /></button></>}
        </div>
      </div>}
      {isError && !assistantResults && <div className="error-state"><div className="error-symbol"><Search size={22} /></div><h3>We couldn’t load homes right now.</h3><p>Give it another try in a moment.</p><button className="button-primary" onClick={() => refetch()}>Try again <ArrowRight size={15} /></button></div>}
      {isLoading && !assistantResults && <div className="property-grid">{[1,2,3].map((item) => <div className="property-skeleton" key={item}><div className="skeleton-image" /><div className="skeleton-line long" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>}
      {!isLoading && !isError && list.length === 0 && <div className="empty-state"><div className="empty-illustration"><HomeIcon size={28} /></div><h3>No homes match those details just yet.</h3><p>Try loosening a filter or describe what you’re after to Nestly.</p><button onClick={() => {setMaxRent('');setBedrooms(''); setAssistantResults(null);}} className="button-outline">Show all homes <ArrowRight size={14} /></button></div>}
      {!isLoading && list.length > 0 && <div className="property-grid">{list.map((property, index) => <PropertyCard key={property.id} property={property} index={index} saved={saved.includes(property.id)} comparing={compareIds.includes(property.id)} selected={selectedPropertyId === property.id} onSave={() => toggleSaved(property.id)} onCompare={() => toggleCompare(property.id)} onVisit={() => setVisitProperty(property)} onSelect={() => setSelectedPropertyId((current) => current === property.id ? null : property.id)} />)}</div>}
      {selectedProperty && <div className="selected-home-action" aria-live="polite"><div><span>YOUR PICK</span><strong>{selectedProperty.title}</strong><small>{selectedProperty.neighborhood}, {selectedProperty.city} · {money(selectedProperty.rent)}/mo</small></div><button className="button-primary" disabled={!datesConfirmed} onClick={() => {setBookingProperty(selectedProperty); setBookingStage('choose');}} data-testid="button-continue-booking">{datesConfirmed ? <>Choose your next step <ArrowRight size={15} /></> : 'Confirm dates above to continue'}</button></div>}
      <div className="inventory-foot"><span>Thoughtful homes, no surprises.</span><span>Always confirm listing details directly with the property owner.</span></div>
    </section>
    <section className="how-section" id="how"><div className="how-inner"><div className="how-copy"><div className="eyebrow small"><span className="eyebrow-dot" /> THE NESTLY WAY</div><h2>Finding a home<br />should feel <em>simple.</em></h2><p>Good decisions happen when you have the right information and a person-sized next step.</p></div><div className="steps"><div className="step"><span>01</span><div><h3>Say what matters.</h3><p>Neighbourhood, budget, morning light, your dog. Start anywhere.</p></div></div><div className="step"><span>02</span><div><h3>See the whole picture.</h3><p>Rent, space, move-in date and the details that make a place work.</p></div></div><div className="step"><span>03</span><div><h3>Go see for yourself.</h3><p>Pick a time that works. We’ll help get a visit on the calendar.</p></div></div></div></div></section>
    <footer className="footer"><Brand /><span>Good homes. Clear next steps.</span><a href="#homes">Back to homes <ArrowRight size={14} /></a><small>© Nestly Rentals · Made for renters, with care.</small></footer>
    {visitProperty && <VisitDialog property={visitProperty} onClose={() => setVisitProperty(null)} />}
    {bookingProperty && preferences?.moveInDate && preferences.moveOutDate && bookingStage === 'choose' && <BookingChoiceDialog property={bookingProperty} moveInDate={preferences.moveInDate} moveOutDate={preferences.moveOutDate} onReserve={() => setBookingStage('reserve')} onVisit={() => setBookingStage('visit')} onClose={closeBookingFlow} />}
    {bookingProperty && preferences?.moveInDate && preferences.moveOutDate && bookingStage === 'reserve' && <ReservationDialog property={bookingProperty} moveInDate={preferences.moveInDate} moveOutDate={preferences.moveOutDate} onClose={closeBookingFlow} />}
    {bookingProperty && bookingStage === 'visit' && <VisitDialog property={bookingProperty} onClose={closeBookingFlow} />}
    {showCompare && <CompareDialog properties={list.filter((property) => compareIds.includes(property.id))} onClose={() => setShowCompare(false)} onVisit={(property) => {setShowCompare(false); setVisitProperty(property);}} />}
  </main>;
}

function PropertyCard({ property, index, saved, comparing, selected, onSave, onCompare, onVisit, onSelect }: { property: Property; index: number; saved: boolean; comparing: boolean; selected: boolean; onSave: () => void; onCompare: () => void; onVisit: () => void; onSelect: () => void }) {
  return <article className={`property-card animate-enter delay-${Math.min(index + 1, 3)} ${selected ? 'selected-home' : ''}`} data-testid={`card-property-${property.id}`}>
    <Link href={`/properties/${property.id}`} className="card-photo-link" aria-label={`View ${property.title}`}>
      <div className="card-photo" style={{ background: property.imageUrl ? `linear-gradient(180deg,transparent 48%,rgba(24,36,31,.24)),url("${property.imageUrl}") center/cover` : palette[index % palette.length] }}>
        {!property.imageUrl && <div className="room-scene"><div className="scene-sun" /><div className="scene-window"><i /><i /><i /><i /></div><div className="scene-plant"><b /><i /><i /><i /></div><div className="scene-couch" /><div className="scene-rug" /></div>}
        {property.featured && <span className="featured-label"><Sparkles size={12} /> A GOOD FIND</span>}
        <span className="photo-index">N° {String(index + 1).padStart(2, '0')}</span>
      </div>
    </Link>
    <div className="card-body">
      <div className="card-location"><MapPin size={13} /> {property.neighborhood}, {property.city}</div>
      <div className="card-title-row"><Link href={`/properties/${property.id}`} className="card-title">{property.title}</Link><button onClick={onSave} className={`save-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Remove saved home' : 'Save home'} data-testid={`button-save-${property.id}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
      <div className="card-address">{property.address}</div>
      <div className="card-facts"><span><BedDouble size={15} /> {property.bedrooms} bed{property.bedrooms !== 1 ? 's' : ''}</span><span><Ruler size={14} /> {property.areaSqFt.toLocaleString('en-IN')} sq ft</span><span><CalendarDays size={14} /> From {shortDate(property.availableFrom)}</span></div>
      <div className="card-price-row"><div><strong>{money(property.rent)}</strong><span> / month</span></div><button onClick={onVisit} className="visit-link" data-testid={`button-visit-${property.id}`}>Ask to visit <MoveUpRight size={14} /></button></div>
      <button type="button" className={`select-home-button ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected} data-testid={`button-select-home-${property.id}`}>{selected ? <><Check size={14} /> Selected home</> : <>Choose this home <ArrowRight size={14} /></>}</button>
      <label className="compare-check"><input type="checkbox" checked={comparing} onChange={onCompare} data-testid={`checkbox-compare-${property.id}`} /><span className="custom-check">{comparing && <Check size={12} />}</span> Compare this home</label>
    </div>
  </article>;
}

function BookingChoiceDialog({ property, moveInDate, moveOutDate, onReserve, onVisit, onClose }: { property: Property; moveInDate: string; moveOutDate: string; onReserve: () => void; onVisit: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={(event) => {if (event.target === event.currentTarget) onClose();}}><div className="modal booking-choice-modal" role="dialog" aria-modal="true" aria-labelledby="booking-choice-title">
    <button className="modal-close" onClick={onClose} aria-label="Close booking options"><X size={19} /></button>
    <div className="modal-kicker"><span className="eyebrow-dot" /> YOUR NEXT STEP</div>
    <h2 id="booking-choice-title">A good home<br /><em>takes shape.</em></h2>
    <div className="visit-home-summary"><div className="summary-mark"><HomeIcon size={18} /></div><div><strong>{property.title}</strong><span>{property.neighborhood}, {property.city} · {money(property.rent)}/mo</span></div></div>
    <div className="booking-dates"><CalendarDays size={17} /><span>Move in <strong>{shortDate(moveInDate)}</strong> · Move out <strong>{shortDate(moveOutDate)}</strong></span></div>
    <p className="modal-description">Your dates are confirmed. Choose what you’d like to do next.</p>
    <div className="booking-options">
      <button type="button" className="booking-option" onClick={onReserve} data-testid="button-start-reservation"><span className="booking-option-icon"><HomeIcon size={18} /></span><strong>Request to reserve</strong><span>Share your details and ask the owner to confirm this home for your dates.</span><ArrowRight size={15} /></button>
      <button type="button" className="booking-option" onClick={onVisit} data-testid="button-start-viewing"><span className="booking-option-icon"><CalendarDays size={18} /></span><strong>Schedule a site visit</strong><span>Pick an available day and time to see the home in person.</span><ArrowRight size={15} /></button>
    </div>
    <p className="booking-disclaimer"><ShieldCheck size={13} /> Sample listings only. A reservation request is not a lease or a guaranteed hold.</p>
  </div></div>;
}

function ReservationDialog({ property, moveInDate, moveOutDate, onClose }: { property: Property; moveInDate: string; moveOutDate: string; onClose: () => void }) {
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState('');
  const reservation = useCreateReservation();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    const form = new FormData(event.currentTarget);
    const data: ReservationInput = {
      propertyId: property.id,
      fullName: String(form.get('fullName')).trim(),
      email: String(form.get('email')).trim(),
      phone: String(form.get('phone') || '').trim() || undefined,
      moveInDate,
      moveOutDate,
      notes: String(form.get('notes') || '').trim() || undefined,
    };
    reservation.mutate({ data }, { onSuccess: () => setSuccess(true), onError: () => setFormError('Your request couldn’t be saved. Check your details and try again.') });
  };
  return <div className="modal-backdrop" onClick={(event) => {if (event.target === event.currentTarget && !reservation.isPending) onClose();}}><div className="modal visit-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-title">
    <button className="modal-close" onClick={onClose} aria-label="Close reservation request" disabled={reservation.isPending}><X size={19} /></button>
    {success ? <div className="success-panel"><div className="success-icon"><CheckCircle2 size={30} /></div><div className="eyebrow small"><span className="eyebrow-dot" /> REQUEST SAVED</div><h2 id="reservation-title">One step<br /><em>closer to home.</em></h2><p>Your request for <strong>{property.title}</strong>, from {shortDate(moveInDate)} to {shortDate(moveOutDate)}, is saved. It does not place a hold or contact the owner.</p><button className="button-primary" onClick={onClose}>Done <ArrowRight size={15} /></button></div> :
    <><div className="modal-kicker"><span className="eyebrow-dot" /> RESERVATION REQUEST</div><h2 id="reservation-title">Ask for this<br /><em>home.</em></h2><p className="modal-description">We’ll save your request for the dates you confirmed. No payment or lease is created.</p>
      <div className="visit-home-summary"><div className="summary-mark"><HomeIcon size={18} /></div><div><strong>{property.title}</strong><span>{property.neighborhood}, {property.city} · {money(property.rent)}/mo</span></div></div>
      <div className="booking-dates"><CalendarDays size={17} /><span>Move in <strong>{shortDate(moveInDate)}</strong> · Move out <strong>{shortDate(moveOutDate)}</strong></span></div>
      <form onSubmit={submit} className="visit-form">
        <div className="form-pair"><label>Your name<input required name="fullName" placeholder="e.g. Aditi Rao" minLength={2} maxLength={120} data-testid="input-reservation-name" /></label><label>Email address<input required type="email" name="email" placeholder="you@example.com" maxLength={254} data-testid="input-reservation-email" /></label></div>
        <label>Phone number <span className="optional">OPTIONAL</span><input type="tel" name="phone" placeholder="+91 98765 43210" maxLength={40} data-testid="input-reservation-phone" /></label>
        <label>A note for the owner <span className="optional">OPTIONAL</span><textarea name="notes" rows={2} maxLength={1000} placeholder="Anything they should know about your move?" data-testid="input-reservation-notes" /></label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="button-primary submit-visit" disabled={reservation.isPending} data-testid="button-submit-reservation">{reservation.isPending ? 'Saving your request…' : <>Send reservation request <ArrowRight size={16} /></>}</button>
        <p className="form-fineprint"><ShieldCheck size={13} /> The owner has not been notified by this sample site.</p>
      </form>
    </>}
  </div></div>;
}

function shortDate(value: string) {
  if (!value) return 'Ask owner';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function VisitDialog({ property, onClose, initialDate = '', initialTime = '' }: { property: Property; onClose: () => void; initialDate?: string; initialTime?: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState('');
  const visit = useCreateViewing();
  const avail = useGetPropertyAvailability(property.id, date, { query: { enabled: Boolean(date), queryKey: getGetPropertyAvailabilityQueryKey(property.id, date) } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError('');
    if (!date || !time) { setFormError('Choose a date and a time to request your visit.'); return; }
    const form = new FormData(event.currentTarget);
    const data: ViewingInput = { propertyId: property.id, fullName: String(form.get('fullName')).trim(), email: String(form.get('email')).trim(), phone: String(form.get('phone') || '').trim() || undefined, preferredDate: date, preferredTime: time, notes: String(form.get('notes') || '').trim() || undefined };
    visit.mutate({ data }, { onSuccess: () => { setSuccess(true); void queryClient.invalidateQueries({ queryKey: getGetPropertyAvailabilityQueryKey(property.id, date) }); }, onError: () => setFormError('Your request couldn’t be sent. Please check your details and try again.') });
  };
  return <div className="modal-backdrop" onClick={(event) => {if (event.target === event.currentTarget) onClose();}}><div className="modal visit-modal" role="dialog" aria-modal="true" aria-labelledby="visit-title">
    <button className="modal-close" onClick={onClose} aria-label="Close" data-testid="button-close-visit"><X size={19} /></button>
     {success ? <div className="success-panel"><div className="success-icon"><CheckCircle2 size={30} /></div><div className="eyebrow small"><span className="eyebrow-dot" /> REQUEST SAVED</div><h2 id="visit-title">A first look is<br />one step closer.</h2><p>Your visit request for <strong>{property.title}</strong> is saved. Owner notifications aren’t connected in this sample site yet.</p><button className="button-primary" onClick={onClose}>All right <ArrowRight size={15} /></button></div> :
     <><div className="modal-kicker"><span className="eyebrow-dot" /> LET’S MAKE IT REAL</div><h2 id="visit-title">Go see if it feels<br /><em>like home.</em></h2><p className="modal-description">Choose a preferred date and time. This sample saves your request but does not contact the owner.</p>
      <div className="visit-home-summary"><div className="summary-mark"><HomeIcon size={18} /></div><div><strong>{property.title}</strong><span>{property.neighborhood}, {property.city} · {money(property.rent)}/mo</span></div></div>
      <form onSubmit={submit} className="visit-form">
        <div className="form-pair"><label>Your name<input required name="fullName" placeholder="e.g. Aditi Rao" minLength={2} maxLength={120} data-testid="input-viewing-name" /></label><label>Email address<input required type="email" name="email" placeholder="you@example.com" maxLength={254} data-testid="input-viewing-email" /></label></div>
        <label>Phone number <span className="optional">OPTIONAL</span><input type="tel" name="phone" placeholder="+91 98765 43210" maxLength={40} data-testid="input-viewing-phone" /></label>
        <div className="form-pair"><label>Preferred date<input required type="date" min={today()} value={date} onChange={(event) => {setDate(event.target.value);setTime('');}} data-testid="input-viewing-date" /></label><label>Preferred time<select required value={time} onChange={(event) => setTime(event.target.value)} disabled={!date || avail.isLoading} data-testid="select-viewing-time"><option value="">{!date ? 'Choose a date first' : avail.isLoading ? 'Checking times…' : 'Choose a time'}</option>{(avail.data?.slots ?? []).map((slot) => <option value={slot} key={slot}>{slot}</option>)}</select></label></div>
        {date && avail.isError && <div className="availability-message error-text">Times could not be checked. Try another date.</div>}
        {date && !avail.isLoading && avail.data?.slots.length === 0 && <div className="availability-message">No visit times listed for this day. Please choose another date.</div>}
        {date && avail.data && avail.data.slots.length > 0 && <div className="availability-message"><CheckCircle2 size={14} /> {avail.data.slots.length} available times for {shortDate(date)}.</div>}
        <label>A note for the owner <span className="optional">OPTIONAL</span><textarea name="notes" rows={2} maxLength={1000} placeholder="Anything they'd find helpful to know?" data-testid="input-viewing-notes" /></label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="button-primary submit-visit" disabled={visit.isPending} data-testid="button-submit-viewing">{visit.isPending ? 'Sending your request…' : <>Request a visit <ArrowRight size={16} /></>}</button>
        <p className="form-fineprint"><ShieldCheck size={13} /> Your details are only shared to arrange this visit.</p>
      </form>
    </>}
  </div></div>;
}

function CompareDialog({ properties, onClose, onVisit }: { properties: Property[]; onClose: () => void; onVisit: (property: Property) => void }) {
  return <div className="modal-backdrop" onClick={(event) => {if (event.target === event.currentTarget) onClose();}}><div className="modal compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button className="modal-close" onClick={onClose} aria-label="Close comparison"><X size={19} /></button><div className="eyebrow small"><span className="eyebrow-dot" /> SIDE BY SIDE</div><h2 id="compare-title">The details,<br /><em>together.</em></h2><div className="compare-table"><div className="compare-row labels"><span>THE DETAILS</span>{properties.map((home) => <span key={home.id}>{home.neighborhood}</span>)}</div>{[['Monthly rent', ...properties.map((home) => `${money(home.rent)} / month`)], ['Bedrooms', ...properties.map((home) => `${home.bedrooms}`)], ['Bathrooms', ...properties.map((home) => `${home.bathrooms}`)], ['Space', ...properties.map((home) => `${home.areaSqFt.toLocaleString('en-IN')} sq ft`)], ['Available from', ...properties.map((home) => shortDate(home.availableFrom))], ['Lease term', ...properties.map((home) => home.leaseTerm)], ['Home type', ...properties.map((home) => home.propertyType)]].map((row) => <div className="compare-row" key={row[0]}><span>{row[0]}</span>{row.slice(1).map((value, index) => <strong key={index}>{value}</strong>)}</div>)}</div><div className="compare-actions">{properties.map((home) => <button key={home.id} className="button-primary" onClick={() => onVisit(home)}>Visit {home.neighborhood} <ArrowRight size={14} /></button>)}</div></div></div>;
}

function PropertyDetail() {
  const [match, params] = useRoute('/properties/:id');
  const id = Number(params?.id || 0);
  const { data: property, isLoading, isError, refetch } = useGetProperty(id, { query: { enabled: match && Number.isFinite(id) && id > 0, queryKey: getGetPropertyQueryKey(id) } });
  const [visitOpen, setVisitOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const avail = useGetPropertyAvailability(id, date, { query: { enabled: Boolean(date && id), queryKey: getGetPropertyAvailabilityQueryKey(id, date) } });
  return <main><Header detail /><div className="detail-page"><Link href="/" className="back-link"><ArrowLeft size={15} /> All homes</Link>
    {isLoading && <div className="detail-skeleton"><div className="skeleton-image" /><div className="skeleton-line long" /><div className="skeleton-line" /></div>}
    {isError && <div className="error-state"><div className="error-symbol"><Search size={22} /></div><h3>We couldn’t find that home.</h3><p>It may have moved, or the details are taking a moment.</p><button className="button-primary" onClick={() => refetch()}>Try again <ArrowRight size={15} /></button></div>}
    {property && <><div className="detail-heading"><div><div className="eyebrow small"><span className="eyebrow-dot" /> {property.propertyType.toUpperCase()} · {property.neighborhood.toUpperCase()}</div><h1>{property.title}</h1><p><MapPin size={15} /> {property.address}, {property.city}</p></div><div className="detail-price"><strong>{money(property.rent)}</strong><span>per month</span></div></div>
      <div className="detail-image" style={{ background: property.imageUrl ? `linear-gradient(180deg,transparent 58%,rgba(24,36,31,.15)),url("${property.imageUrl}") center/cover` : palette[(property.id - 201) % palette.length] }}><div className="detail-image-inner">{!property.imageUrl && <div className="room-scene large"><div className="scene-sun" /><div className="scene-window"><i /><i /><i /><i /></div><div className="scene-plant"><b /><i /><i /><i /></div><div className="scene-couch" /><div className="scene-rug" /></div>}<span className="detail-image-caption"><Sparkles size={13} /> YOUR NEXT CHAPTER, PERHAPS</span></div></div>
      <div className="detail-layout"><div className="detail-main"><div className="detail-facts"><div><BedDouble size={17} /><span><strong>{property.bedrooms}</strong> bedrooms</span></div><div><Ruler size={17} /><span><strong>{property.areaSqFt.toLocaleString('en-IN')}</strong> sq ft</span></div><div><CalendarDays size={17} /><span>Available <strong>{shortDate(property.availableFrom)}</strong></span></div><div><Clock3 size={17} /><span><strong>{property.leaseTerm}</strong> lease</span></div></div><section className="detail-copy"><div className="eyebrow small"><span className="eyebrow-dot" /> A CLOSER LOOK</div><h2>Room to make it<br /><em>your own.</em></h2><p>{property.description}</p></section><section className="amenity-section"><h3>The useful details.</h3><div className="amenities">{property.amenities.map((amenity) => <span key={amenity}><Check size={14} /> {amenity}</span>)}</div></section><div className="honest-note"><ShieldCheck size={19} /><p><strong>Good to know</strong><br />This is sample inventory. Please confirm the rent, availability and property details with the owner before making plans.</p></div></div>
        <aside className="availability-card"><div className="eyebrow small"><span className="eyebrow-dot" /> TAKE THE NEXT STEP</div><h2>See how it<br /><em>feels in person.</em></h2><p>Pick a date and check the available visit times.</p><label>VISIT DATE<input type="date" min={today()} value={date} onChange={(event) => {setDate(event.target.value);setTime('');}} data-testid="input-detail-date" /></label>{date && <div className="detail-slots"><span>AVAILABLE TIMES</span>{avail.isLoading ? <div className="slot-loading"><i /><i /><i /></div> : avail.isError ? <p>Times unavailable. Try again later.</p> : avail.data?.slots.length ? <div className="slot-pills">{avail.data.slots.map((slot) => <button key={slot} className={time === slot ? 'selected' : ''} onClick={() => setTime(slot)} data-testid={`button-slot-${slot.replace(/\W/g, '')}`}>{slot}</button>)}</div> : <p>No times listed for this date.</p>}</div>}<button className="button-primary full-button" onClick={() => setVisitOpen(true)} disabled={Boolean(date && !time)} data-testid="button-detail-visit">Request a site visit <ArrowRight size={16} /></button><p className="aside-privacy"><ShieldCheck size={13} /> No pressure. Just a first look.</p></aside>
      </div></>}
    </div>{visitOpen && property && <VisitDialog property={property} onClose={() => setVisitOpen(false)} initialDate={date} initialTime={time} />}<footer className="footer"><Brand /><span>Good homes. Clear next steps.</span><Link href="/" className="footer-link">Explore homes <ArrowRight size={14} /></Link><small>© Nestly Rentals · Made for renters, with care.</small></footer></main>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/properties/:id" component={PropertyDetail} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
