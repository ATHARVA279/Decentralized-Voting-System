import { Injectable }     from '@angular/core';
import { HttpClient }     from '@angular/common/http';
import { Observable } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { environment }    from '../../../environments/environment';

export interface CastVoteDto {
  election_id:  string;
  candidate_id: string;
}

export interface VoteStatus {
  election_id: string;
  has_voted:   boolean;
}

export interface LiveVoteCount {
  election_id:  string;
  candidate_id: string;
  vote_count:   number;
  updated_at:   string;
}

@Injectable({ providedIn: 'root' })
export class VoteService {
  private readonly API = `${environment.voteServiceUrl}/api/votes`;
  private readonly WS  = `${environment.voteServiceWs}/api/votes/live`;

  constructor(private http: HttpClient) {}

  cast(dto: CastVoteDto): Observable<{ message: string; vote_id: string; vote_hash: string }> {
    return this.http.post<{ message: string; vote_id: string; vote_hash: string }>(
      `${this.API}/cast`, dto
    );
  }

  status(electionId: string): Observable<VoteStatus> {
    return this.http.get<VoteStatus>(`${this.API}/status/${electionId}`);
  }

  auditTrail(electionId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/audit/${electionId}`);
  }

  /** Connect to WebSocket for real-time vote counts */
  connectLive(electionId: string): WebSocketSubject<LiveVoteCount | any> {
    const token = localStorage.getItem('access_token') ?? '';
    return webSocket<LiveVoteCount | any>(
      `${this.WS}/${electionId}?token=${token}`
    );
  }
}
