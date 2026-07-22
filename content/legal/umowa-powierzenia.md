# UMOWA POWIERZENIA PRZETWARZANIA DANYCH OSOBOWYCH

**(art. 28 RODO)**

**KSeF — faktury**

Wersja: {{VERSION}}  
Data: 22 lipca 2026 r.

---

## Strony

**Administrator** — Użytkownik systemu **KSeF — faktury** (przedsiębiorca korzystający z Usługi), który wgrywa do Systemu dokumenty zawierające dane osobowe.

**Procesor** — **Patryk Budnicki**, prowadzący działalność gospodarczą pod firmą **PATRYK BUDNICKI FRUITAGE CLTH**, NIP **9552540785**, REGON **386020992**, adres: **ul. Ks. bpa Władysława Bandurskiego 70/11, 71-685 Szczecin**, e-mail: **p.budnicki95@gmail.com**.

Umowa zostaje zawarta z chwilą akceptacji jej treści przez Użytkownika w Systemie (checkbox przy rejestracji / na stronie akceptacji dokumentów) i obowiązuje przez czas korzystania z Usługi.

---

## §1 Przedmiot powierzenia

1. Administrator powierza Procesorowi przetwarzanie danych osobowych w celu świadczenia usług systemu **KSeF — faktury** dostępnego pod adresem {{APP_URL}}, w szczególności: przechowywania wgranych faktur i danych z nich wynikających, lokalnego odczytu PDF, edycji, generowania XML FA(3) oraz wysyłki do KSeF na polecenie Administratora.
2. Procesor przetwarza dane wyłącznie na udokumentowane polecenie Administratora — korzystanie z funkcji Systemu (wgranie, zapis, wysyłka) stanowi takie polecenie.
3. Procesor **nie wykorzystuje** treści faktur do trenowania modeli AI ani **nie przekazuje** ich do zewnętrznych systemów sztucznej inteligencji. Odczyt PDF odbywa się lokalnym parserem w infrastrukturze Procesora / jego podprocesorów infrastrukturalnych.

---

## §2 Charakter, cel i czas przetwarzania

| Element   | Opis                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Charakter | Hosting, przechowywanie, odczyt lokalnym parserem, transformacja do XML, transmisja do KSeF na żądanie               |
| Cel       | Świadczenie Usługi KSeF — faktury                                                                                    |
| Czas      | Okres korzystania z Systemu oraz okres wynikający z obowiązków prawnych / żądań Administratora dotyczących usunięcia |

---

## §3 Rodzaj danych i kategorie osób

1. **Rodzaj danych:** imię i nazwisko, nazwa firmy / oznaczenie przedsiębiorcy, adres, NIP oraz inne dane zawarte w fakturach i powiązanych plikach / strukturach XML; dane techniczne związane z przetwarzaniem w Systemie.
2. **Kategorie osób:** kontrahenci Administratora (w tym osoby fizyczne prowadzące jednoosobową działalność gospodarczą), ewentualnie inne osoby wskazane na fakturach (np. osoby kontaktowe), w zakresie wynikającym z treści dokumentów wgranych przez Administratora.

---

## §4 Obowiązki Procesora

Procesor zobowiązuje się do:

1. przetwarzania danych wyłącznie zgodnie z Umową, Regulaminem i poleceniami Administratora, chyba że obowiązek wynika z prawa UE lub prawa polskiego,
2. zapewnienia, że osoby upoważnione do przetwarzania zobowiązały się do poufności,
3. stosowania środków technicznych i organizacyjnych odpowiednich do ryzyka (art. 32 RODO),
4. przestrzegania warunków korzystania z usług innego procesora (podprocesora) — §5,
5. wspierania Administratora — w miarę możliwości i z uwzględnieniem charakteru przetwarzania — w realizacji praw osób, których dane dotyczą,
6. wspierania Administratora w zakresie bezpieczeństwa, zgłaszania naruszeń do organu nadzorczego i zawiadamiania osób — w zakresie wynikającym z roli Procesora,
7. po zakończeniu świadczenia usług związanych z przetwarzaniem — **usunięcia danych**, chyba że prawo Unii Europejskiej lub prawo polskie nakazują ich przechowywanie; jeżeli Administrator chce zachować kopię wgranych danych, powinien **wyeksportować je z Systemu przed usunięciem konta**; Procesor nie ma obowiązku „zwrotu” danych w formie odrębnego eksportu po usunięciu konta; kopie zapasowe usuwane są zgodnie z cyklem retencji,
8. udostępnienia Administratorowi informacji niezbędnych do wykazania spełnienia obowiązków art. 28 RODO oraz umożliwienia audytów w rozsądnym zakresie, z odpowiednim wyprzedzeniem i z poszanowaniem poufności innych klientów oraz tajemnic przedsiębiorstwa; audyt odbywa się w godzinach pracy Procesora i **nie częściej niż raz w roku**, chyba że wystąpi uzasadnione podejrzenie naruszenia; **koszty audytu ponosi Administrator**, o ile strony nie postanowią inaczej.

---

## §5 Dalsze powierzenie (podprocesorzy)

1. Administrator wyraża **ogólną zgodę** na korzystanie przez Procesora z podprocesorów infrastrukturalnych niezbędnych do świadczenia Usługi, w szczególności:
   - **Supabase** (baza danych, uwierzytelnianie, powiązany hosting),
   - dostawcy chmury obliczeniowej wykorzystywani przez infrastrukturę (np. **AWS**).
2. Procesor informuje o istotnych zmianach podprocesorów w sposób dostępny w Systemie lub Polityce prywatności. Administrator może sprzeciwić się zmianie z ważnych powodów związanych z ochroną danych; brak możliwości kontynuacji Usługi na dotychczasowych warunkach może skutkować rozwiązaniem umowy o świadczenie Usługi.
3. Procesor zawiera z podprocesorami umowy zapewniające poziom ochrony odpowiadający Umowie.

---

## §6 Naruszenia ochrony danych

1. Procesor po stwierdzeniu naruszenia ochrony danych osobowych zgłasza je Administratorowi **bez zbędnej zwłoki**, dążąc do przekazania informacji **w ciągu 48 godzin** od stwierdzenia naruszenia, o ile jest to możliwe.
2. Zgłoszenie obejmuje — w miarę dostępności — opis charakteru naruszenia, kategorie i przybliżoną liczbę osób / rekordów, możliwe konsekwencje oraz środki zaradcze.

---

## §7 Obowiązki Administratora

Administrator oświadcza, że:

1. posiada podstawę prawną do powierzenia danych Procesorowi,
2. treści wgrywane do Systemu są związane z prowadzoną działalnością gospodarczą,
3. odpowiada za poinformowanie osób, których dane dotyczą, jeżeli wymagają tego przepisy,
4. weryfikuje dane przed wysyłką do KSeF.

---

## §8 Czas trwania i wypowiedzenie

1. Umowa obowiązuje przez czas korzystania przez Administratora z Systemu.
2. Z chwilą usunięcia konta lub trwałego zaprzestania korzystania z Usługi Umowa wygasa, z zastrzeżeniem obowiązków trwających po jej zakończeniu (usunięcie danych, poufność). Obowiązek **zachowania poufności** obowiązuje również po zakończeniu Umowy.

---

## §9 Postanowienia końcowe

1. Umowa podlega prawu polskiemu oraz RODO.
2. W sprawach nieuregulowanych stosuje się Regulamin oraz Politykę prywatności Systemu.
3. Zmiana wersji Umowy publikowanej w Systemie może wymagać ponownej akceptacji przez Administratora.
